import { intersectSegmentBvh, type PatchBvh } from "@/acoustics/hybrid3d/bvh";
import {
  dot3,
  length3,
  lerp3,
  normalize3,
  pointInPatch3,
  scale3,
  subtract3,
  SOUND_SPEED_MPS,
  type AcousticPatch3,
  type Vec3,
} from "@/acoustics/hybrid3d/geometry";

const EPSILON = 1e-8;

export type FirstOrderReflection3D = Readonly<{
  id: string;
  surfaceId: string;
  patchId: string;
  materialId: string;
  reflectionPoint: Vec3;
  pathLengthM: number;
  delayMs: number;
  excessDelayMs: number;
  arrivalDirection: Vec3;
}>;

export function physicalSurfaceId(patch: AcousticPatch3): string {
  return patch.wallId ?? patch.id;
}

export function representativePatches(bvh: PatchBvh): readonly AcousticPatch3[] {
  const seen = new Set<string>();
  return bvh.patches.filter((patch) => {
    if (patch.wallId && !patch.id.endsWith(":front")) return false;
    const id = physicalSurfaceId(patch);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function reflectedPoint(source: Vec3, patch: AcousticPatch3): Vec3 {
  const signedDistance = dot3(subtract3(source, patch.vertices[0]!), patch.normal);
  return subtract3(source, scale3(patch.normal, 2 * signedDistance));
}

export function imageRayIntersection(
  imageSource: Vec3,
  listener: Vec3,
  patch: AcousticPatch3,
): Vec3 | null {
  const ray = subtract3(listener, imageSource);
  const denominator = dot3(patch.normal, ray);
  if (Math.abs(denominator) <= EPSILON) return null;
  const t = dot3(patch.normal, subtract3(patch.vertices[0]!, imageSource)) / denominator;
  if (t <= EPSILON || t >= 1 - EPSILON) return null;
  const point = lerp3(imageSource, listener, t);
  return pointInPatch3(point, patch) ? point : null;
}

export function reflectionLegIsVisible(
  start: Vec3,
  end: Vec3,
  bvh: PatchBvh,
  allowedSurfaceIds: readonly string[],
): boolean {
  const allowed = new Set(allowedSurfaceIds);
  return intersectSegmentBvh(start, end, bvh).every(
    (hit) => allowed.has(hit.wallId ?? "") || allowed.has(hit.patchId),
  );
}

export function findFirstOrderReflections3D(
  source: Vec3,
  listener: Vec3,
  bvh: PatchBvh,
): readonly FirstOrderReflection3D[] {
  const directDistance = length3(subtract3(source, listener));
  const candidates: FirstOrderReflection3D[] = [];
  for (const patch of representativePatches(bvh)) {
    const surfaceId = physicalSurfaceId(patch);
    const point = imageRayIntersection(reflectedPoint(source, patch), listener, patch);
    if (!point) continue;
    if (!reflectionLegIsVisible(source, point, bvh, [surfaceId]) ||
      !reflectionLegIsVisible(point, listener, bvh, [surfaceId])) {
      continue;
    }
    const pathLengthM = length3(subtract3(source, point)) + length3(subtract3(point, listener));
    candidates.push({
      id: `first:${surfaceId}`,
      surfaceId,
      patchId: patch.id,
      materialId: patch.materialId,
      reflectionPoint: point,
      pathLengthM,
      delayMs: (pathLengthM / SOUND_SPEED_MPS) * 1000,
      excessDelayMs: ((pathLengthM - directDistance) / SOUND_SPEED_MPS) * 1000,
      arrivalDirection: normalize3(subtract3(point, listener)),
    });
  }
  return candidates.sort((left, right) =>
    left.pathLengthM !== right.pathLengthM
      ? left.pathLengthM - right.pathLengthM
      : left.id.localeCompare(right.id),
  );
}
