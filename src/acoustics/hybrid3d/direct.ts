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
  classicProjectionHash: string;
  computedAtMs: number;
  paths: readonly DirectPath3D[];
}>;

function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function uniqueWallIds(hits: readonly SegmentPatchHit[]): readonly string[] {
  return [...new Set(hits.flatMap(({ wallId }) => (wallId ? [wallId] : [])))];
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

export function computeHybridDirectFrame(
  geometry: HybridGeometry,
  computedAtMs = 0,
): HybridDirectFrame {
  return {
    classicProjectionHash: geometry.document.compatibility.classicProjectionHash,
    computedAtMs,
    paths: computeHybridDirectPaths(geometry),
  };
}
