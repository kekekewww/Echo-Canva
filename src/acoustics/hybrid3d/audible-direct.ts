import {
  computeAcousticFrame,
  type AcousticFrameSource,
} from "@/acoustics/compute-frame";
import type { HybridDirectAudioState, HybridDirectRouteType, SpatialPosition3 } from "@/audio/types";
import type { HybridGeometry } from "@/acoustics/hybrid3d/compile";
import type { DirectPath3D, HybridDirectFrame } from "@/acoustics/hybrid3d/direct";
import { MATERIALS } from "@/domain/materials/registry";

const MAX_DIRECT_LOSS_DB = 24;
const MIN_CUTOFF_HZ = 700;
const MAX_CUTOFF_HZ = 20_000;

export type HybridAudiblePath = Readonly<{
  sourceId: string;
  routeType: HybridDirectRouteType;
  effectiveDistanceM: number;
  dryGainDb: number;
  lowpassHz: number;
  virtualPosition: SpatialPosition3;
  portalIds: readonly string[];
  occluderWallIds: readonly string[];
}>;

export type HybridAudibleDirectState = Readonly<{
  audioState: HybridDirectAudioState;
  paths: readonly HybridAudiblePath[];
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function distance3(left: SpatialPosition3, right: SpatialPosition3): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function uniqueWallIds(path: DirectPath3D): readonly string[] {
  return [...new Set(path.occluderWallIds)];
}

function estimateFinitePatchOcclusion(path: DirectPath3D, geometry: HybridGeometry): Readonly<{
  dryGainDb: number;
  lowpassHz: number;
}> {
  const direction = path.directionToSource;
  const losses = uniqueWallIds(path).reduce(
    (total, wallId) => {
      const wall = geometry.document.baseScene.walls.find((candidate) => candidate.id === wallId);
      if (!wall) return total;
      const material = MATERIALS.find((candidate) => candidate.id === wall.materialId);
      if (!material) return total;
      const wallLengthM = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
      if (wallLengthM === 0) return total;
      const normalX = -(wall.b.y - wall.a.y) / wallLengthM;
      const normalZ = (wall.b.x - wall.a.x) / wallLengthM;
      const incidence = Math.abs(normalX * direction.x + normalZ * direction.z);
      const effectiveThicknessM = wall.thicknessM / Math.max(incidence, 0.25);
      const thicknessAdjustmentDb = 6 * Math.log2(effectiveThicknessM / material.referenceThicknessM);

      return {
        low: total.low + Math.max(0, material.transmissionLossDb.low + thicknessAdjustmentDb),
        mid: total.mid + Math.max(0, material.transmissionLossDb.mid + thicknessAdjustmentDb),
        high: total.high + Math.max(0, material.transmissionLossDb.high + thicknessAdjustmentDb),
      };
    },
    { low: 0, mid: 0, high: 0 },
  );
  const highObstruction = clamp(losses.high / 36, 0, 1);

  return {
    dryGainDb: losses.mid === 0 ? 0 : -Math.min(losses.mid, MAX_DIRECT_LOSS_DB),
    lowpassHz: MIN_CUTOFF_HZ * (MAX_CUTOFF_HZ / MIN_CUTOFF_HZ) ** (1 - highObstruction),
  };
}

function portalPosition(
  portalId: string,
  geometry: HybridGeometry,
): SpatialPosition3 | null {
  const portal = geometry.document.baseScene.portals.find((candidate) => candidate.id === portalId);
  const spatial = geometry.document.extensions.spatial3d;
  if (!portal || !spatial) return null;
  return {
    x: portal.center.x,
    y: spatial.floorElevationM + portal.heightM * 0.5,
    z: portal.center.y,
  };
}

function portalRouteDistance(
  projection: AcousticFrameSource,
  sourcePosition: SpatialPosition3,
  listenerPosition: SpatialPosition3,
  geometry: HybridGeometry,
): number {
  const points = projection.routePolyline.map((point, index, all) => {
    if (index === 0) return sourcePosition;
    if (index === all.length - 1) return listenerPosition;
    const portal = geometry.document.baseScene.portals.find(
      (candidate) => candidate.center.x === point.x && candidate.center.y === point.y && candidate.open,
    );
    return portal ? portalPosition(portal.id, geometry) : { x: point.x, y: sourcePosition.y, z: point.y };
  });
  return points.slice(1).reduce((total, point, index) => total + distance3(points[index]!, point!), 0);
}

function resolvePath(
  path: DirectPath3D,
  projection: AcousticFrameSource | undefined,
  geometry: HybridGeometry,
): HybridAudiblePath {
  const sourcePosition = geometry.sourcePositions[path.sourceId!]!;
  const listenerPosition = geometry.listenerPosition;
  if (path.directVisible) {
    return {
      sourceId: path.sourceId!,
      routeType: "direct",
      effectiveDistanceM: path.distanceM,
      dryGainDb: 0,
      lowpassHz: MAX_CUTOFF_HZ,
      virtualPosition: sourcePosition,
      portalIds: [],
      occluderWallIds: [],
    };
  }

  if (projection?.routeType === "portal") {
    const listenerFacingPortalId = projection.portalIds.at(-1);
    const virtualPosition = listenerFacingPortalId
      ? portalPosition(listenerFacingPortalId, geometry)
      : null;
    if (virtualPosition) {
      return {
        sourceId: path.sourceId!,
        routeType: "portal",
        effectiveDistanceM: portalRouteDistance(
          projection,
          sourcePosition,
          listenerPosition,
          geometry,
        ),
        dryGainDb: projection.dryGainDb,
        lowpassHz: projection.lowpassHz,
        virtualPosition,
        portalIds: projection.portalIds,
        occluderWallIds: uniqueWallIds(path),
      };
    }
  }

  const occlusion = estimateFinitePatchOcclusion(path, geometry);
  return {
    sourceId: path.sourceId!,
    routeType: "blocked",
    effectiveDistanceM: path.distanceM,
    dryGainDb: occlusion.dryGainDb,
    lowpassHz: occlusion.lowpassHz,
    virtualPosition: sourcePosition,
    portalIds: [],
    occluderWallIds: uniqueWallIds(path),
  };
}

/**
 * Maps finite-patch direct visibility plus the validated X/Z portal approximation into the
 * persistent Browser HRTF graph. It is an interactive acoustic approximation, not diffraction.
 */
export function resolveHybridAudibleDirectState(
  geometry: HybridGeometry,
  directFrame: HybridDirectFrame,
): HybridAudibleDirectState {
  const projections = new Map(
    computeAcousticFrame(geometry.document.baseScene).sources.map((source) => [source.sourceId, source]),
  );
  const paths = directFrame.paths.map((path) => resolvePath(path, projections.get(path.sourceId!), geometry));

  return {
    audioState: {
      listenerPosition: geometry.listenerPosition,
      sourceStates: Object.fromEntries(paths.map((path) => [
        path.sourceId,
        {
          position: path.virtualPosition,
          effectiveDistanceM: path.effectiveDistanceM,
          dryGainDb: path.dryGainDb,
          lowpassHz: path.lowpassHz,
          routeType: path.routeType,
        },
      ])),
    },
    paths,
  };
}
