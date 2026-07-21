import type { SceneSpec } from "@/domain/scene/types";
import type { AcousticPrimitive, Room3D } from "@/domain/workspace/types";

export const MAX_PRIMITIVES = 8;
export const PRIMITIVE_RADIAL_SEGMENTS = 12;
export const MIN_PRIMITIVE_DIMENSION_M = 0.1;

type Vec2 = Readonly<{ x: number; y: number }>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rotatePlanPoint(point: Vec2, rotationYDeg: number): Vec2 {
  const radians = rotationYDeg * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

export function primitiveFootprint(primitive: AcousticPrimitive): readonly Vec2[] {
  const { x: widthM, z: depthM } = primitive.dimensions;
  const local = primitive.kind === "box"
    ? [
        { x: -widthM / 2, y: -depthM / 2 },
        { x: widthM / 2, y: -depthM / 2 },
        { x: widthM / 2, y: depthM / 2 },
        { x: -widthM / 2, y: depthM / 2 },
      ]
    : Array.from({ length: PRIMITIVE_RADIAL_SEGMENTS }, (_, index) => {
        const angle = index / PRIMITIVE_RADIAL_SEGMENTS * Math.PI * 2;
        return { x: Math.cos(angle) * widthM / 2, y: Math.sin(angle) * depthM / 2 };
      });
  return local.map((point) => {
    const rotated = rotatePlanPoint(point, primitive.rotationYDeg);
    return { x: primitive.position.x + rotated.x, y: primitive.position.z + rotated.y };
  });
}

export function primitiveFootprintWalls(primitive: AcousticPrimitive): SceneSpec["walls"] {
  const footprint = primitiveFootprint(primitive);
  return footprint.map((point, index) => ({
    id: `primitive:${primitive.id}:${index}`,
    a: point,
    b: footprint[(index + 1) % footprint.length]!,
    thicknessM: MIN_PRIMITIVE_DIMENSION_M,
    materialId: primitive.materialId,
    kind: "partition" as const,
  }));
}

export function constrainPrimitiveToRoom(
  primitive: AcousticPrimitive,
  room: Pick<Room3D, "widthM" | "depthM" | "heightM">,
): AcousticPrimitive {
  const rotationYDeg = Number.isFinite(primitive.rotationYDeg) ? primitive.rotationYDeg : 0;
  let dimensions = {
    x: clamp(primitive.dimensions.x, MIN_PRIMITIVE_DIMENSION_M, room.widthM),
    y: clamp(primitive.dimensions.y, MIN_PRIMITIVE_DIMENSION_M, room.heightM),
    z: clamp(primitive.dimensions.z, MIN_PRIMITIVE_DIMENSION_M, room.depthM),
  };
  let unpositioned = { ...primitive, dimensions, rotationYDeg, position: { x: 0, y: 0, z: 0 } };
  let footprint = primitiveFootprint(unpositioned);
  const initialHalfX = Math.max(...footprint.map(({ x }) => Math.abs(x)));
  const initialHalfZ = Math.max(...footprint.map(({ y }) => Math.abs(y)));
  const planScale = Math.min(
    1,
    room.widthM / (2 * initialHalfX),
    room.depthM / (2 * initialHalfZ),
  );
  if (planScale < 1) {
    dimensions = {
      ...dimensions,
      x: Math.max(MIN_PRIMITIVE_DIMENSION_M, dimensions.x * planScale),
      z: Math.max(MIN_PRIMITIVE_DIMENSION_M, dimensions.z * planScale),
    };
    unpositioned = { ...unpositioned, dimensions };
    footprint = primitiveFootprint(unpositioned);
  }
  const halfX = Math.max(...footprint.map(({ x }) => Math.abs(x)));
  const halfZ = Math.max(...footprint.map(({ y }) => Math.abs(y)));
  const halfY = dimensions.y / 2;
  return {
    ...primitive,
    dimensions,
    rotationYDeg,
    position: {
      x: clamp(primitive.position.x, halfX, room.widthM - halfX),
      y: clamp(primitive.position.y, halfY, room.heightM - halfY),
      z: clamp(primitive.position.z, halfZ, room.depthM - halfZ),
    },
  };
}

export function primitiveIdFromFootprintWall(wallId: string): string | null {
  if (!wallId.startsWith("primitive:")) return null;
  const parts = wallId.split(":");
  return parts.length === 3 ? parts[1] ?? null : null;
}
