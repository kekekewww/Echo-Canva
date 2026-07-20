import { intersectSegmentBvh } from "@/acoustics/hybrid3d/bvh";
import type { PatchBvh } from "@/acoustics/hybrid3d/bvh";
import {
  length3,
  normalize3,
  scale3,
  subtract3,
  SOUND_SPEED_MPS,
  type SegmentPatchHit,
  type Vec3,
} from "@/acoustics/hybrid3d/geometry";
import type { HybridGeometry } from "@/acoustics/hybrid3d/compile";
import { findFirstOrderReflections3D, type FirstOrderReflection3D } from "@/acoustics/hybrid3d/reflections";

export type DirectPath3D = Readonly<{
  sourceId?: string;
  routeType: "direct" | "blocked";
  directVisible: boolean;
  distanceM: number;
  delayMs: number;
  directionToSource: Vec3;
  propagationDirection: Vec3;
  azimuthDeg: number;
  elevationDeg: number;
  occluderWallIds: readonly string[];
  hits: readonly SegmentPatchHit[];
}>;

export type HybridDirectFrame = Readonly<{
  revision: number;
  classicProjectionHash: string;
  computedAtMs: number;
  paths: readonly DirectPath3D[];
  firstOrderReflectionsBySource: Readonly<Record<string, readonly FirstOrderReflection3D[]>>;
}>;

export type HybridDirectPoseSnapshot = Readonly<{
  revision: number;
  staticFingerprint: string;
  classicProjectionHash: string;
  listenerPosition: Vec3;
  sources: readonly Readonly<{ id: string; position: Vec3 }>[];
}>;

export type HybridDirectSourceResult = Readonly<{
  sourceId: string;
  revision: number;
  staticFingerprint: string;
  classicProjectionHash: string;
  path: DirectPath3D;
  firstOrderReflections: readonly FirstOrderReflection3D[];
}>;

function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function uniqueWallIds(hits: readonly SegmentPatchHit[]): readonly string[] {
  return [...new Set(hits.map(({ wallId, surfaceId }) => wallId ?? surfaceId))];
}

export function solveDirectPath3D(
  sourcePosition: Vec3,
  listenerPosition: Vec3,
  bvh: PatchBvh,
): DirectPath3D {
  const toSource = subtract3(sourcePosition, listenerPosition);
  const distanceM = length3(toSource);
  if (distanceM <= 0) throw new Error("Source and listener positions must be distinct in Hybrid 3D.");
  const directionToSource = normalize3(toSource);
  const hits = intersectSegmentBvh(sourcePosition, listenerPosition, bvh);
  return {
    routeType: hits.length === 0 ? "direct" : "blocked",
    directVisible: hits.length === 0,
    distanceM,
    delayMs: (distanceM / SOUND_SPEED_MPS) * 1000,
    directionToSource,
    propagationDirection: scale3(directionToSource, -1),
    azimuthDeg: degrees(Math.atan2(directionToSource.x, directionToSource.z)),
    elevationDeg: degrees(Math.asin(directionToSource.y)),
    occluderWallIds: uniqueWallIds(hits),
    hits,
  };
}

export function computeHybridDirectPaths(geometry: HybridGeometry): readonly DirectPath3D[] {
  return geometry.document.baseScene.sources.map((source) => ({
    sourceId: source.id,
    ...solveDirectPath3D(geometry.sourcePositions[source.id]!, geometry.listenerPosition, geometry.bvh),
  }));
}

export function createHybridDirectPoseSnapshot(
  geometry: HybridGeometry,
): HybridDirectPoseSnapshot {
  return {
    revision: geometry.document.baseScene.revision,
    staticFingerprint: geometry.staticGeometryHash,
    classicProjectionHash: geometry.document.compatibility.classicProjectionHash,
    listenerPosition: geometry.listenerPosition,
    sources: geometry.document.baseScene.sources.map((source) => ({
      id: source.id,
      position: geometry.sourcePositions[source.id]!,
    })),
  };
}

export function computeHybridDirectSources(
  snapshot: HybridDirectPoseSnapshot,
  bvh: PatchBvh,
  sourceIds: readonly string[],
): readonly HybridDirectSourceResult[] {
  const requested = new Set<string>();
  const sourcesById = new Map(snapshot.sources.map((source) => [source.id, source]));
  return sourceIds.map((sourceId) => {
    if (requested.has(sourceId)) throw new Error(`Duplicate Hybrid source ID requested: ${sourceId}`);
    requested.add(sourceId);
    const source = sourcesById.get(sourceId);
    if (!source) throw new Error(`Unknown Hybrid source ID requested: ${sourceId}`);
    return {
      sourceId,
      revision: snapshot.revision,
      staticFingerprint: snapshot.staticFingerprint,
      classicProjectionHash: snapshot.classicProjectionHash,
      path: {
        sourceId,
        ...solveDirectPath3D(source.position, snapshot.listenerPosition, bvh),
      },
      firstOrderReflections: findFirstOrderReflections3D(
        source.position,
        snapshot.listenerPosition,
        bvh,
      ),
    };
  });
}

export function assembleHybridDirectFrame(
  snapshot: HybridDirectPoseSnapshot,
  results: readonly HybridDirectSourceResult[],
  computedAtMs: number,
): HybridDirectFrame {
  const expectedIds = new Set(snapshot.sources.map(({ id }) => id));
  const byId = new Map<string, HybridDirectSourceResult>();
  for (const result of results) {
    if (!expectedIds.has(result.sourceId)) {
      throw new Error(`Unknown Hybrid source result: ${result.sourceId}`);
    }
    if (byId.has(result.sourceId)) {
      throw new Error(`Duplicate Hybrid source result: ${result.sourceId}`);
    }
    if (result.revision !== snapshot.revision) {
      throw new Error(`Hybrid source result revision mismatch for ${result.sourceId}.`);
    }
    if (result.staticFingerprint !== snapshot.staticFingerprint) {
      throw new Error(`Hybrid source result static fingerprint mismatch for ${result.sourceId}.`);
    }
    if (result.classicProjectionHash !== snapshot.classicProjectionHash) {
      throw new Error(`Hybrid source result projection hash mismatch for ${result.sourceId}.`);
    }
    if (result.path.sourceId !== result.sourceId) {
      throw new Error(`Hybrid source result payload ID mismatch for ${result.sourceId}.`);
    }
    byId.set(result.sourceId, result);
  }
  const missingIds = snapshot.sources
    .map(({ id }) => id)
    .filter((sourceId) => !byId.has(sourceId));
  if (missingIds.length > 0) {
    throw new Error(`Missing Hybrid source results: ${missingIds.join(", ")}`);
  }
  return {
    revision: snapshot.revision,
    classicProjectionHash: snapshot.classicProjectionHash,
    computedAtMs,
    paths: snapshot.sources.map(({ id }) => byId.get(id)!.path),
    firstOrderReflectionsBySource: Object.fromEntries(
      snapshot.sources.map(({ id }) => [id, byId.get(id)!.firstOrderReflections]),
    ),
  };
}

export function computeHybridDirectFrame(
  geometry: HybridGeometry,
  computedAtMs = 0,
): HybridDirectFrame {
  const snapshot = createHybridDirectPoseSnapshot(geometry);
  const results = computeHybridDirectSources(
    snapshot,
    geometry.bvh,
    snapshot.sources.map(({ id }) => id),
  );
  return assembleHybridDirectFrame(snapshot, results, computedAtMs);
}
