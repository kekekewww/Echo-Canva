import { ACOUSTIC_EPSILON, distance, dot, segmentIntersection, subtract, traceDirectPath } from "@/acoustics/geometry";
import type { ReflectionTap } from "@/acoustics/types";
import type { SceneSpec, Vec2 } from "@/domain/scene/types";
import { MATERIALS, type AcousticMaterial } from "@/domain/materials/registry";

const SPEED_OF_SOUND_MPS = 343;
const MAX_TAPS = 6;
const MAX_EARLY_DELAY_MS = 80;
const MIN_REFLECTION_GAIN_DB = -60;
const MIN_CUTOFF_HZ = 700;
const MAX_CUTOFF_HZ = 20_000;

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
  return Math.sqrt(Math.max(0, 1 - absorption - transmission));
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

function isVisibleLeg(
  start: Vec2,
  end: Vec2,
  reflectionPoint: Vec2,
  reflectingWallId: string,
  scene: SceneSpec,
): boolean {
  for (const wall of scene.walls) {
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
      const imageSource = reflectAcrossWallLine(source, wall);
      if (imageSource === null) {
        return [];
      }

      const hit = segmentIntersection(imageSource, listener, wall.a, wall.b);
      if (hit === null) {
        return [];
      }

      const reflectionPoint = hit.point;
      if (
        !isVisibleLeg(source, reflectionPoint, reflectionPoint, wall.id, scene) ||
        !isVisibleLeg(reflectionPoint, listener, reflectionPoint, wall.id, scene)
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
        wallId: wall.id,
        reflectionPoint,
        pathLengthM,
        delayMs: Math.max(0, delayMs),
        gainDb,
        lowpassHz: lowpassForReflection(material),
      }];
    })
    .sort((a, b) => b.gainDb - a.gainDb || a.wallId.localeCompare(b.wallId))
    .slice(0, tapLimit);
}
