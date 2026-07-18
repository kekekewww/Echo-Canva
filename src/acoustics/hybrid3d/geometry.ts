export const SOUND_SPEED_MPS = 343;
const EPSILON = 1e-8;

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export type Aabb3 = Readonly<{ min: Vec3; max: Vec3 }>;

export type PortalOpening3 = Readonly<{
  id: string;
  wallId: string;
  center: Vec3;
  along: Vec3;
  widthM: number;
  floorElevationM: number;
  heightM: number;
}>;

export type AcousticPatchKind = "floor" | "ceiling" | "wall";

export type AcousticPatch3 = Readonly<{
  id: string;
  kind: AcousticPatchKind;
  materialId: string;
  wallId?: string;
  vertices: readonly Vec3[];
  normal: Vec3;
  aabb: Aabb3;
  openings: readonly PortalOpening3[];
}>;

export type SegmentPatchHit = Readonly<{
  patchId: string;
  wallId?: string;
  distanceM: number;
  point: Vec3;
}>;

export function add3(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

export function subtract3(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

export function scale3(vector: Vec3, scalar: number): Vec3 {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

export function dot3(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function cross3(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

export function length3(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function normalize3(vector: Vec3): Vec3 {
  const length = length3(vector);
  if (length <= EPSILON) throw new Error("Cannot normalize a zero-length 3D vector.");
  return scale3(vector, 1 / length);
}

export function lerp3(start: Vec3, end: Vec3, t: number): Vec3 {
  return add3(start, scale3(subtract3(end, start), t));
}

export function aabbForPoints(points: readonly Vec3[]): Aabb3 {
  if (points.length === 0) throw new Error("An AABB needs at least one point.");
  return points.slice(1).reduce<Aabb3>(
    (bounds, point) => ({
      min: {
        x: Math.min(bounds.min.x, point.x),
        y: Math.min(bounds.min.y, point.y),
        z: Math.min(bounds.min.z, point.z),
      },
      max: {
        x: Math.max(bounds.max.x, point.x),
        y: Math.max(bounds.max.y, point.y),
        z: Math.max(bounds.max.z, point.z),
      },
    }),
    { min: points[0]!, max: points[0]! },
  );
}

export function unionAabb3(left: Aabb3, right: Aabb3): Aabb3 {
  return {
    min: {
      x: Math.min(left.min.x, right.min.x),
      y: Math.min(left.min.y, right.min.y),
      z: Math.min(left.min.z, right.min.z),
    },
    max: {
      x: Math.max(left.max.x, right.max.x),
      y: Math.max(left.max.y, right.max.y),
      z: Math.max(left.max.z, right.max.z),
    },
  };
}

export function aabbCentroid3(bounds: Aabb3): Vec3 {
  return {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
}

export function segmentIntersectsAabb3(start: Vec3, end: Vec3, bounds: Aabb3): boolean {
  const delta = subtract3(end, start);
  let tMin = 0;
  let tMax = 1;
  for (const axis of ["x", "y", "z"] as const) {
    if (Math.abs(delta[axis]) <= EPSILON) {
      if (start[axis] < bounds.min[axis] - EPSILON || start[axis] > bounds.max[axis] + EPSILON) {
        return false;
      }
      continue;
    }
    const inverse = 1 / delta[axis];
    let near = (bounds.min[axis] - start[axis]) * inverse;
    let far = (bounds.max[axis] - start[axis]) * inverse;
    if (near > far) [near, far] = [far, near];
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    if (tMin > tMax) return false;
  }
  return true;
}

function projectToDominantPlane(point: Vec3, normal: Vec3): readonly [number, number] {
  const absolute = { x: Math.abs(normal.x), y: Math.abs(normal.y), z: Math.abs(normal.z) };
  if (absolute.x >= absolute.y && absolute.x >= absolute.z) return [point.y, point.z];
  if (absolute.y >= absolute.z) return [point.x, point.z];
  return [point.x, point.y];
}

function pointOnSegment2(point: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): boolean {
  const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
  if (Math.abs(cross) > EPSILON) return false;
  return point[0] >= Math.min(a[0], b[0]) - EPSILON &&
    point[0] <= Math.max(a[0], b[0]) + EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + EPSILON;
}

export function pointInPatch3(point: Vec3, patch: Pick<AcousticPatch3, "vertices" | "normal">): boolean {
  const projectedPoint = projectToDominantPlane(point, patch.normal);
  const polygon = patch.vertices.map((vertex) => projectToDominantPlane(vertex, patch.normal));
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if (pointOnSegment2(projectedPoint, a, b)) return true;
    const crosses = (a[1] > projectedPoint[1]) !== (b[1] > projectedPoint[1]);
    if (crosses) {
      const xAtY = ((b[0] - a[0]) * (projectedPoint[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (projectedPoint[0] < xAtY) inside = !inside;
    }
  }
  return inside;
}

export function makePatch3(
  id: string,
  kind: AcousticPatchKind,
  materialId: string,
  vertices: readonly Vec3[],
  options: Readonly<{ wallId?: string; openings?: readonly PortalOpening3[] }> = {},
): AcousticPatch3 {
  if (vertices.length < 3) throw new Error("An acoustic patch needs at least three vertices.");
  const normal = normalize3(cross3(subtract3(vertices[1]!, vertices[0]!), subtract3(vertices[2]!, vertices[0]!)));
  return {
    id,
    kind,
    materialId,
    ...(options.wallId ? { wallId: options.wallId } : {}),
    vertices: [...vertices],
    normal,
    aabb: aabbForPoints(vertices),
    openings: options.openings ? [...options.openings] : [],
  };
}

export function pointIsInsidePortalOpening(point: Vec3, opening: PortalOpening3): boolean {
  const relative = subtract3(point, opening.center);
  const alongDistance = dot3(relative, opening.along);
  return Math.abs(alongDistance) <= opening.widthM * 0.5 + EPSILON &&
    point.y >= opening.floorElevationM - EPSILON &&
    point.y <= opening.floorElevationM + opening.heightM + EPSILON;
}

export function intersectSegmentPatch(start: Vec3, end: Vec3, patch: AcousticPatch3): SegmentPatchHit | null {
  const delta = subtract3(end, start);
  const denominator = dot3(patch.normal, delta);
  if (Math.abs(denominator) <= EPSILON) return null;
  const t = dot3(patch.normal, subtract3(patch.vertices[0]!, start)) / denominator;
  if (t <= EPSILON || t >= 1 - EPSILON) return null;
  const point = lerp3(start, end, t);
  if (!pointInPatch3(point, patch)) return null;
  if (patch.openings.some((opening) => pointIsInsidePortalOpening(point, opening))) return null;
  return {
    patchId: patch.id,
    ...(patch.wallId ? { wallId: patch.wallId } : {}),
    distanceM: length3(delta) * t,
    point,
  };
}
