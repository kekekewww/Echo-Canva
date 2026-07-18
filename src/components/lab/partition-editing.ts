export type HybridPlanPoint = Readonly<{ x: number; z: number }>;

export type HybridEditablePartition = Readonly<{
  a: HybridPlanPoint;
  b: HybridPlanPoint;
  thicknessM: number;
  materialId: string;
}>;

export type HybridEditablePortal = Readonly<{
  center: HybridPlanPoint;
  widthM: number;
  heightM: number;
  open: boolean;
}>;

export const HYBRID_PLAN_BOUNDS = Object.freeze({
  minX: 0.2,
  maxX: 11.8,
  minZ: 0.2,
  maxZ: 7.8,
});

const MIN_PARTITION_LENGTH_M = 1;
const PORTAL_EDGE_CLEARANCE_M = 0.1;
const MIN_PORTAL_WIDTH_M = 0.4;
const MAX_PORTAL_HEIGHT_M = 2.8;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function snap(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampHybridPlanPoint(point: HybridPlanPoint): HybridPlanPoint {
  return {
    x: snap(clamp(point.x, HYBRID_PLAN_BOUNDS.minX, HYBRID_PLAN_BOUNDS.maxX)),
    z: snap(clamp(point.z, HYBRID_PLAN_BOUNDS.minZ, HYBRID_PLAN_BOUNDS.maxZ)),
  };
}

export function partitionLength(partition: HybridEditablePartition): number {
  return Math.hypot(partition.b.x - partition.a.x, partition.b.z - partition.a.z);
}

export function constrainPartitionEndpoint(
  partition: HybridEditablePartition,
  endpoint: "a" | "b",
  candidate: HybridPlanPoint,
): HybridEditablePartition {
  const nextPoint = clampHybridPlanPoint(candidate);
  const opposite = endpoint === "a" ? partition.b : partition.a;
  if (Math.hypot(nextPoint.x - opposite.x, nextPoint.z - opposite.z) < MIN_PARTITION_LENGTH_M) {
    return partition;
  }
  return endpoint === "a" ? { ...partition, a: nextPoint } : { ...partition, b: nextPoint };
}

export function constrainPortalToPartition(
  portal: HybridEditablePortal,
  partition: HybridEditablePartition,
): HybridEditablePortal {
  const lengthM = partitionLength(partition);
  const maxWidthM = Math.max(MIN_PORTAL_WIDTH_M, lengthM - PORTAL_EDGE_CLEARANCE_M * 2);
  const widthM = snap(clamp(portal.widthM, MIN_PORTAL_WIDTH_M, maxWidthM));
  const directionX = (partition.b.x - partition.a.x) / lengthM;
  const directionZ = (partition.b.z - partition.a.z) / lengthM;
  const projectedDistanceM = (portal.center.x - partition.a.x) * directionX +
    (portal.center.z - partition.a.z) * directionZ;
  const distanceFromA = clamp(
    projectedDistanceM,
    widthM * 0.5 + PORTAL_EDGE_CLEARANCE_M,
    lengthM - widthM * 0.5 - PORTAL_EDGE_CLEARANCE_M,
  );

  return {
    ...portal,
    center: {
      // The V1 SceneSpec validator requires a portal centre to lie on its host wall.
      // Keep this projection at full precision; rounding a centre on an angled wall moves it off
      // the wall and makes the otherwise valid scene unserializable.
      x: partition.a.x + directionX * distanceFromA,
      z: partition.a.z + directionZ * distanceFromA,
    },
    widthM,
    heightM: snap(clamp(portal.heightM, 0.4, MAX_PORTAL_HEIGHT_M)),
  };
}

export function portalEdgePoints(
  portal: HybridEditablePortal,
  partition: HybridEditablePartition,
): Readonly<{ near: HybridPlanPoint; far: HybridPlanPoint }> {
  const lengthM = partitionLength(partition);
  const directionX = (partition.b.x - partition.a.x) / lengthM;
  const directionZ = (partition.b.z - partition.a.z) / lengthM;
  const halfWidthM = portal.widthM * 0.5;
  return {
    near: { x: portal.center.x - directionX * halfWidthM, z: portal.center.z - directionZ * halfWidthM },
    far: { x: portal.center.x + directionX * halfWidthM, z: portal.center.z + directionZ * halfWidthM },
  };
}
