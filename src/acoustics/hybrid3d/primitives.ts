import { makePatch3, type AcousticPatch3, type Vec3 } from "@/acoustics/hybrid3d/geometry";
import type { AcousticPrimitive } from "@/domain/workspace/types";

const CYLINDER_SEGMENTS = 12;
const SPHERE_LONGITUDES = 8;
const SPHERE_LATITUDE_BANDS = 4;

function transform(local: Vec3, primitive: AcousticPrimitive): Vec3 {
  const radians = primitive.rotationYDeg * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: primitive.position.x + local.x * cosine - local.z * sine,
    y: primitive.position.y + local.y,
    z: primitive.position.z + local.x * sine + local.z * cosine,
  };
}

function patch(
  primitive: AcousticPrimitive,
  id: string,
  vertices: readonly Vec3[],
): AcousticPatch3 {
  return makePatch3(`${primitive.id}:${id}`, "primitive", primitive.materialId, vertices, {
    surfaceId: primitive.id,
    thicknessM: Math.min(primitive.dimensions.x, primitive.dimensions.y, primitive.dimensions.z),
  });
}

function boxPatches(primitive: AcousticPrimitive): readonly AcousticPatch3[] {
  const half = {
    x: primitive.dimensions.x / 2,
    y: primitive.dimensions.y / 2,
    z: primitive.dimensions.z / 2,
  };
  const bottom = [
    { x: -half.x, y: -half.y, z: -half.z },
    { x: half.x, y: -half.y, z: -half.z },
    { x: half.x, y: -half.y, z: half.z },
    { x: -half.x, y: -half.y, z: half.z },
  ].map((point) => transform(point, primitive));
  const top = [
    { x: -half.x, y: half.y, z: -half.z },
    { x: half.x, y: half.y, z: -half.z },
    { x: half.x, y: half.y, z: half.z },
    { x: -half.x, y: half.y, z: half.z },
  ].map((point) => transform(point, primitive));
  return [
    patch(primitive, "bottom", [bottom[3]!, bottom[2]!, bottom[1]!, bottom[0]!]),
    patch(primitive, "top", top),
    ...bottom.map((point, index) => patch(primitive, `side:${index}`, [
      point,
      bottom[(index + 1) % 4]!,
      top[(index + 1) % 4]!,
      top[index]!,
    ])),
  ];
}

function cylinderPatches(primitive: AcousticPrimitive): readonly AcousticPatch3[] {
  const halfY = primitive.dimensions.y / 2;
  const ring = (y: number) => Array.from({ length: CYLINDER_SEGMENTS }, (_, index) => {
    const angle = index / CYLINDER_SEGMENTS * Math.PI * 2;
    return transform({
      x: Math.cos(angle) * primitive.dimensions.x / 2,
      y,
      z: Math.sin(angle) * primitive.dimensions.z / 2,
    }, primitive);
  });
  const bottom = ring(-halfY);
  const top = ring(halfY);
  return [
    patch(primitive, "bottom", [...bottom].reverse()),
    patch(primitive, "top", top),
    ...bottom.map((point, index) => patch(primitive, `side:${index}`, [
      point,
      bottom[(index + 1) % CYLINDER_SEGMENTS]!,
      top[(index + 1) % CYLINDER_SEGMENTS]!,
      top[index]!,
    ])),
  ];
}

function spherePoint(primitive: AcousticPrimitive, latitude: number, longitude: number): Vec3 {
  const latitudeRadians = latitude * Math.PI / 2;
  const longitudeRadians = longitude * Math.PI * 2;
  const radial = Math.cos(latitudeRadians);
  return transform({
    x: radial * Math.cos(longitudeRadians) * primitive.dimensions.x / 2,
    y: Math.sin(latitudeRadians) * primitive.dimensions.y / 2,
    z: radial * Math.sin(longitudeRadians) * primitive.dimensions.z / 2,
  }, primitive);
}

function spherePatches(primitive: AcousticPrimitive): readonly AcousticPatch3[] {
  const rows = Array.from({ length: SPHERE_LATITUDE_BANDS + 1 }, (_, latitudeIndex) => {
    const latitude = -1 + latitudeIndex * (2 / SPHERE_LATITUDE_BANDS);
    return Array.from({ length: SPHERE_LONGITUDES }, (_, longitudeIndex) =>
      spherePoint(primitive, latitude, longitudeIndex / SPHERE_LONGITUDES));
  });
  const patches: AcousticPatch3[] = [];
  for (let latitudeIndex = 0; latitudeIndex < SPHERE_LATITUDE_BANDS; latitudeIndex += 1) {
    for (let longitudeIndex = 0; longitudeIndex < SPHERE_LONGITUDES; longitudeIndex += 1) {
      const nextLongitude = (longitudeIndex + 1) % SPHERE_LONGITUDES;
      const lower = rows[latitudeIndex]!;
      const upper = rows[latitudeIndex + 1]!;
      const vertices = latitudeIndex === 0
        ? [lower[longitudeIndex]!, upper[nextLongitude]!, upper[longitudeIndex]!]
        : latitudeIndex === SPHERE_LATITUDE_BANDS - 1
          ? [lower[longitudeIndex]!, lower[nextLongitude]!, upper[longitudeIndex]!]
          : [lower[longitudeIndex]!, lower[nextLongitude]!, upper[nextLongitude]!, upper[longitudeIndex]!];
      patches.push(patch(primitive, `facet:${latitudeIndex}:${longitudeIndex}`, vertices));
    }
  }
  return patches;
}

export function primitivePatches(primitive: AcousticPrimitive): readonly AcousticPatch3[] {
  if (primitive.kind === "box") return boxPatches(primitive);
  if (primitive.kind === "cylinder") return cylinderPatches(primitive);
  return spherePatches(primitive);
}
