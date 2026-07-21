import { distanceAttenuation, linearToDb } from "@/audio/math";

import { materialForHybridReflection, specularReflectionAmplitude } from "@/acoustics/hybrid3d/material-energy";
import type { PatchBvh } from "@/acoustics/hybrid3d/bvh";
import {
  imageRayIntersection,
  physicalSurfaceId,
  reflectedPoint,
  reflectionLegIsVisible,
  representativePatches,
} from "@/acoustics/hybrid3d/reflections";
import {
  length3,
  normalize3,
  subtract3,
  SOUND_SPEED_MPS,
  type AcousticPatch3,
  type Vec3,
} from "@/acoustics/hybrid3d/geometry";

export const MAX_REFERENCE_SECOND_ORDER_PATCHES = 32;
export const DEFAULT_SECOND_ORDER_TOP_K = 6;
export const DEFAULT_SECOND_ORDER_SURFACE_BUDGET = 24;

export type SecondOrderReflection3D = Readonly<{
  id: string;
  surfaceIds: readonly [string, string];
  patchIds: readonly [string, string];
  materialIds: readonly [string, string];
  reflectionPoints: readonly [Vec3, Vec3];
  pathLengthM: number;
  delayMs: number;
  excessDelayMs: number;
  estimatedMidGainDb: number;
  arrivalDirection: Vec3;
}>;

export type SecondOrderSearchStats = Readonly<{
  availablePatches: number;
  consideredPatches: number;
  orderedPairs: number;
  pathLengthPruned: number;
  energyPruned: number;
  evaluatedPairs: number;
  validPaths: number;
  topKPruned: number;
}>;

export type PrunedSecondOrderOptions = Readonly<{
  maxPathLengthM?: number;
  minEstimatedGainDb?: number;
  maxCandidates?: number;
  maxRepresentativePatches?: number;
}>;

function stablePathOrder(left: SecondOrderReflection3D, right: SecondOrderReflection3D): number {
  return left.pathLengthM !== right.pathLengthM
    ? left.pathLengthM - right.pathLengthM
    : left.id.localeCompare(right.id);
}

function directDistance(source: Vec3, listener: Vec3): number {
  return length3(subtract3(source, listener));
}

function midReflectionAmplitude(patch: AcousticPatch3): number {
  return specularReflectionAmplitude(materialForHybridReflection(patch.materialId), "mid");
}

function boundedRepresentativePatches(
  source: Vec3,
  listener: Vec3,
  patches: readonly AcousticPatch3[],
  maximum: number,
): readonly AcousticPatch3[] {
  return [...patches]
    .sort((left, right) => {
      const leftLength = length3(subtract3(reflectedPoint(source, left), listener));
      const rightLength = length3(subtract3(reflectedPoint(source, right), listener));
      return leftLength !== rightLength
        ? leftLength - rightLength
        : physicalSurfaceId(left).localeCompare(physicalSurfaceId(right));
    })
    .slice(0, Math.max(2, Math.floor(maximum)));
}

function estimatedMidGainDb(first: AcousticPatch3, second: AcousticPatch3, pathLengthM: number): number {
  return linearToDb(
    midReflectionAmplitude(first) *
    midReflectionAmplitude(second) *
    distanceAttenuation(pathLengthM),
  );
}

export function solveSecondOrderReflectionPair(
  source: Vec3,
  listener: Vec3,
  first: AcousticPatch3,
  second: AcousticPatch3,
  bvh: PatchBvh,
): SecondOrderReflection3D | null {
  const firstSurfaceId = physicalSurfaceId(first);
  const secondSurfaceId = physicalSurfaceId(second);
  if (firstSurfaceId === secondSurfaceId) return null;

  const firstImage = reflectedPoint(source, first);
  const secondImage = reflectedPoint(firstImage, second);
  const secondPoint = imageRayIntersection(secondImage, listener, second);
  if (!secondPoint) return null;
  const firstPoint = imageRayIntersection(firstImage, secondPoint, first);
  if (!firstPoint) return null;
  if (
    !reflectionLegIsVisible(source, firstPoint, bvh, [firstSurfaceId]) ||
    !reflectionLegIsVisible(firstPoint, secondPoint, bvh, [firstSurfaceId, secondSurfaceId]) ||
    !reflectionLegIsVisible(secondPoint, listener, bvh, [secondSurfaceId])
  ) {
    return null;
  }

  const pathLengthM =
    length3(subtract3(source, firstPoint)) +
    length3(subtract3(firstPoint, secondPoint)) +
    length3(subtract3(secondPoint, listener));
  const directLengthM = directDistance(source, listener);
  return {
    id: `second:${firstSurfaceId}>${secondSurfaceId}`,
    surfaceIds: [firstSurfaceId, secondSurfaceId],
    patchIds: [first.id, second.id],
    materialIds: [first.materialId, second.materialId],
    reflectionPoints: [firstPoint, secondPoint],
    pathLengthM,
    delayMs: (pathLengthM / SOUND_SPEED_MPS) * 1000,
    excessDelayMs: ((pathLengthM - directLengthM) / SOUND_SPEED_MPS) * 1000,
    estimatedMidGainDb: estimatedMidGainDb(first, second, pathLengthM),
    arrivalDirection: normalize3(subtract3(secondPoint, listener)),
  };
}

function requireReferenceSize(patches: readonly AcousticPatch3[]): void {
  if (patches.length > MAX_REFERENCE_SECOND_ORDER_PATCHES) {
    throw new Error(
      `Exhaustive second-order reference is limited to ${MAX_REFERENCE_SECOND_ORDER_PATCHES} physical patches.`,
    );
  }
}

/** Test/benchmark oracle: exhaustive ordered-pair second-order Image Source Method. */
export function findExhaustiveSecondOrderReflections3D(
  source: Vec3,
  listener: Vec3,
  bvh: PatchBvh,
): readonly SecondOrderReflection3D[] {
  const patches = representativePatches(bvh);
  requireReferenceSize(patches);
  const paths: SecondOrderReflection3D[] = [];
  for (const first of patches) {
    for (const second of patches) {
      const path = solveSecondOrderReflectionPair(source, listener, first, second, bvh);
      if (path) paths.push(path);
    }
  }
  return paths.sort(stablePathOrder);
}

/** Runtime-candidate branch: path/energy pruning then deterministic perceptual top-K. */
export function findPrunedSecondOrderReflections3D(
  source: Vec3,
  listener: Vec3,
  bvh: PatchBvh,
  options: PrunedSecondOrderOptions = {},
): Readonly<{ paths: readonly SecondOrderReflection3D[]; stats: SecondOrderSearchStats }> {
  const allPatches = representativePatches(bvh);
  const patches = boundedRepresentativePatches(
    source,
    listener,
    allPatches,
    options.maxRepresentativePatches ?? DEFAULT_SECOND_ORDER_SURFACE_BUDGET,
  );
  const maxPathLengthM = options.maxPathLengthM ?? 50;
  const minEstimatedGainDb = options.minEstimatedGainDb ?? -36;
  const maxCandidates = options.maxCandidates ?? DEFAULT_SECOND_ORDER_TOP_K;
  let orderedPairs = 0;
  let pathLengthPruned = 0;
  let energyPruned = 0;
  let evaluatedPairs = 0;
  const paths: SecondOrderReflection3D[] = [];

  for (const first of patches) {
    for (const second of patches) {
      const firstSurfaceId = physicalSurfaceId(first);
      const secondSurfaceId = physicalSurfaceId(second);
      if (firstSurfaceId === secondSurfaceId) continue;
      orderedPairs += 1;
      const imageLengthM = length3(subtract3(reflectedPoint(reflectedPoint(source, first), second), listener));
      if (imageLengthM > maxPathLengthM) {
        pathLengthPruned += 1;
        continue;
      }
      if (estimatedMidGainDb(first, second, imageLengthM) < minEstimatedGainDb) {
        energyPruned += 1;
        continue;
      }
      evaluatedPairs += 1;
      const path = solveSecondOrderReflectionPair(source, listener, first, second, bvh);
      if (path) paths.push(path);
    }
  }

  const ranked = paths.sort(stablePathOrder);
  const selected = ranked.slice(0, Math.max(0, maxCandidates));
  return {
    paths: selected,
    stats: {
      availablePatches: allPatches.length,
      consideredPatches: patches.length,
      orderedPairs,
      pathLengthPruned,
      energyPruned,
      evaluatedPairs,
      validPaths: ranked.length,
      topKPruned: ranked.length - selected.length,
    },
  };
}
