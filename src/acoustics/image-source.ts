import { ACOUSTIC_EPSILON, collinearInteriorOverlap, distance, dot, segmentIntersection, subtract, traceDirectPath } from "@/acoustics/geometry";
import type { ReflectionTap } from "@/acoustics/types";
import type { SceneSpec, Vec2 } from "@/domain/scene/types";
import { MATERIALS, type AcousticMaterial } from "@/domain/materials/registry";

const SPEED_OF_SOUND_MPS = 343;
const MAX_TAPS = 6;
const MAX_EARLY_DELAY_MS = 80;
const MIN_REFLECTION_GAIN_DB = -60;
const MIN_CUTOFF_HZ = 700;
const MAX_CUTOFF_HZ = 20_000;
const DEFAULT_SECOND_ORDER_SURFACE_BUDGET = 24;
const MAX_SECOND_ORDER_PATH_M = 50;
const MIN_SECOND_ORDER_GAIN_DB = -36;

function materialFor(materialId: string): AcousticMaterial {
  const material = MATERIALS.find((candidate) => candidate.id === materialId);
  if (material === undefined) {
    throw new Error(`Unknown acoustic material: ${materialId}`);
  }

  return material;
}

function reflectionAmplitude(material: AcousticMaterial, band: "mid" | "high"): number {
  const absorption = material.absorption[band];
  const transmission = 10 ** (-material.transmissionLossDb[band] / 10);
  const reflectedEnergy = Math.max(0, 1 - absorption - transmission);
  return Math.sqrt(reflectedEnergy * (1 - material.scattering));
}

function distanceAttenuation(pathLengthM: number): number {
  return 1 / Math.max(1, pathLengthM);
}

function linearToDb(amplitude: number): number {
  return 20 * Math.log10(Math.max(amplitude, 1e-8));
}

function reflectAcrossWallLine(point: Vec2, wall: SceneSpec["walls"][number]): Vec2 | null {
  const direction = subtract(wall.b, wall.a);
  const lengthSquared = dot(direction, direction);

  if (lengthSquared <= ACOUSTIC_EPSILON) {
    return null;
  }

  const relative = subtract(point, wall.a);
  const projectionScale = dot(relative, direction) / lengthSquared;
  const projection = {
    x: wall.a.x + direction.x * projectionScale,
    y: wall.a.y + direction.y * projectionScale,
  };

  return {
    x: 2 * projection.x - point.x,
    y: 2 * projection.y - point.y,
  };
}

export function reflectionLegIsVisible2D(
  start: Vec2,
  end: Vec2,
  reflectionPoint: Vec2,
  reflectingWallId: string,
  scene: SceneSpec,
): boolean {
  for (const wall of scene.walls) {
    if (collinearInteriorOverlap(start, end, wall.a, wall.b)) return false;
    const hit = segmentIntersection(start, end, wall.a, wall.b);
    if (hit === null || distance(hit.point, reflectionPoint) > ACOUSTIC_EPSILON) {
      continue;
    }

    if (wall.id !== reflectingWallId) {
      return false;
    }
  }

  return traceDirectPath(start, end, scene).visible;
}

export function firstOrderReflectionPoint2D(
  source: Vec2,
  listener: Vec2,
  wall: SceneSpec["walls"][number],
): Vec2 | null {
  const imageSource = reflectAcrossWallLine(source, wall);
  if (imageSource === null) return null;
  return segmentIntersection(imageSource, listener, wall.a, wall.b)?.point ?? null;
}

function lowpassForReflection(material: AcousticMaterial): number {
  const mid = reflectionAmplitude(material, "mid");
  if (mid <= ACOUSTIC_EPSILON) {
    return MIN_CUTOFF_HZ;
  }

  const highToMid = Math.min(1, reflectionAmplitude(material, "high") / mid);
  return MIN_CUTOFF_HZ * (MAX_CUTOFF_HZ / MIN_CUTOFF_HZ) ** highToMid;
}

/** Finds deterministic, finite-segment first-order image-source reflections. */
export function findFirstOrderReflections(
  source: Vec2,
  listener: Vec2,
  scene: SceneSpec,
  maxTaps: number,
): readonly ReflectionTap[] {
  const referenceLengthM = distance(source, listener);
  const tapLimit = Math.min(MAX_TAPS, Math.max(0, Math.floor(maxTaps)));

  if (tapLimit === 0 || referenceLengthM <= ACOUSTIC_EPSILON) {
    return [];
  }

  return scene.walls
    .flatMap((wall): ReflectionTap[] => {
      const reflectionPoint = firstOrderReflectionPoint2D(source, listener, wall);
      if (reflectionPoint === null) {
        return [];
      }
      if (
        !reflectionLegIsVisible2D(source, reflectionPoint, reflectionPoint, wall.id, scene) ||
        !reflectionLegIsVisible2D(reflectionPoint, listener, reflectionPoint, wall.id, scene)
      ) {
        return [];
      }

      const pathLengthM = distance(source, reflectionPoint) + distance(reflectionPoint, listener);
      const delayMs = ((pathLengthM - referenceLengthM) / SPEED_OF_SOUND_MPS) * 1000;
      const material = materialFor(wall.materialId);
      const gainDb = linearToDb(reflectionAmplitude(material, "mid") * distanceAttenuation(pathLengthM));

      if (delayMs < -ACOUSTIC_EPSILON || delayMs > MAX_EARLY_DELAY_MS || gainDb < MIN_REFLECTION_GAIN_DB) {
        return [];
      }

      return [{
        order: 1,
        wallId: wall.id,
        wallIds: [wall.id],
        reflectionPoint,
        reflectionPoints: [reflectionPoint],
        pathLengthM,
        delayMs: Math.max(0, delayMs),
        gainDb,
        lowpassHz: lowpassForReflection(material),
      }];
    })
    .sort((a, b) => b.gainDb - a.gainDb || a.wallId.localeCompare(b.wallId))
    .slice(0, tapLimit);
}

export function solveSecondOrderReflectionPair2D(
  source: Vec2,
  listener: Vec2,
  first: SceneSpec["walls"][number],
  second: SceneSpec["walls"][number],
  scene: SceneSpec,
): ReflectionTap | null {
  if (first.id === second.id) return null;
  const firstImage = reflectAcrossWallLine(source, first);
  if (!firstImage) return null;
  const secondImage = reflectAcrossWallLine(firstImage, second);
  if (!secondImage) return null;
  const secondPoint = segmentIntersection(secondImage, listener, second.a, second.b)?.point;
  if (!secondPoint) return null;
  const firstPoint = segmentIntersection(firstImage, secondPoint, first.a, first.b)?.point;
  if (!firstPoint) return null;
  if (
    !reflectionLegIsVisible2D(source, firstPoint, firstPoint, first.id, scene) ||
    !reflectionLegIsVisible2D(firstPoint, secondPoint, firstPoint, first.id, scene) ||
    !reflectionLegIsVisible2D(firstPoint, secondPoint, secondPoint, second.id, scene) ||
    !reflectionLegIsVisible2D(secondPoint, listener, secondPoint, second.id, scene)
  ) return null;

  const pathLengthM = distance(source, firstPoint)
    + distance(firstPoint, secondPoint)
    + distance(secondPoint, listener);
  const referenceLengthM = distance(source, listener);
  const delayMs = ((pathLengthM - referenceLengthM) / SPEED_OF_SOUND_MPS) * 1000;
  const firstMaterial = materialFor(first.materialId);
  const secondMaterial = materialFor(second.materialId);
  const gainDb = linearToDb(
    reflectionAmplitude(firstMaterial, "mid")
    * reflectionAmplitude(secondMaterial, "mid")
    * distanceAttenuation(pathLengthM),
  );
  if (
    pathLengthM > MAX_SECOND_ORDER_PATH_M ||
    delayMs < -ACOUSTIC_EPSILON ||
    delayMs > MAX_EARLY_DELAY_MS ||
    gainDb < MIN_SECOND_ORDER_GAIN_DB
  ) return null;
  return {
    order: 2,
    wallId: second.id,
    wallIds: [first.id, second.id],
    reflectionPoint: secondPoint,
    reflectionPoints: [firstPoint, secondPoint],
    pathLengthM,
    delayMs: Math.max(0, delayMs),
    gainDb,
    lowpassHz: Math.min(lowpassForReflection(firstMaterial), lowpassForReflection(secondMaterial)),
  };
}

/** Finds bounded, deterministic ordered-pair second-order image-source reflections. */
export function findSecondOrderReflections(
  source: Vec2,
  listener: Vec2,
  scene: SceneSpec,
  maxTaps: number,
  surfaceBudget = DEFAULT_SECOND_ORDER_SURFACE_BUDGET,
): readonly ReflectionTap[] {
  const tapLimit = Math.min(MAX_TAPS, Math.max(0, Math.floor(maxTaps)));
  if (tapLimit === 0 || distance(source, listener) <= ACOUSTIC_EPSILON) return [];
  const walls = [...scene.walls]
    .sort((left, right) => {
      const leftImage = reflectAcrossWallLine(source, left);
      const rightImage = reflectAcrossWallLine(source, right);
      const leftLength = leftImage ? distance(leftImage, listener) : Number.POSITIVE_INFINITY;
      const rightLength = rightImage ? distance(rightImage, listener) : Number.POSITIVE_INFINITY;
      return leftLength - rightLength || left.id.localeCompare(right.id);
    })
    .slice(0, Math.max(2, Math.floor(surfaceBudget)));
  const candidates: ReflectionTap[] = [];
  for (const first of walls) {
    for (const second of walls) {
      const candidate = solveSecondOrderReflectionPair2D(source, listener, first, second, scene);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates
    .sort((left, right) =>
      right.gainDb - left.gainDb ||
      (left.wallIds?.join(">") ?? left.wallId).localeCompare(right.wallIds?.join(">") ?? right.wallId),
    )
    .slice(0, tapLimit);
}
