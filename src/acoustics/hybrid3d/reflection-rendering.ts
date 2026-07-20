import { distanceAttenuation, linearToDb } from "@/audio/math";
import type { HybridEarlyReflectionTap } from "@/audio/types";

import {
  materialForHybridReflection,
  specularReflectionAmplitude,
} from "@/acoustics/hybrid3d/material-energy";
import type { FirstOrderReflection3D } from "@/acoustics/hybrid3d/reflections";

export const MAX_HYBRID_EARLY_REFLECTION_TAPS = 6;

const MIN_LOWPASS_HZ = 800;
const MAX_LOWPASS_HZ = 20_000;

function lowpassHz(material: ReturnType<typeof materialForHybridReflection>): number {
  const midAmplitude = specularReflectionAmplitude(material, "mid");
  if (midAmplitude <= 1e-8) return MIN_LOWPASS_HZ;
  const highToMidRatio = specularReflectionAmplitude(material, "high") / midAmplitude;
  return Math.min(MAX_LOWPASS_HZ, Math.max(MIN_LOWPASS_HZ, MAX_LOWPASS_HZ * highToMidRatio));
}

/**
 * Converts finite, Worker-validated geometric paths into perceptually tuned, fixed-bank tap values.
 * This is not a six-band material or air-absorption model; those remain later Hybrid phases.
 */
export function renderHybridEarlyReflections(
  reflections: readonly FirstOrderReflection3D[],
): readonly HybridEarlyReflectionTap[] {
  return [...reflections]
    .sort((left, right) =>
      left.pathLengthM !== right.pathLengthM
        ? left.pathLengthM - right.pathLengthM
        : left.id.localeCompare(right.id),
    )
    .slice(0, MAX_HYBRID_EARLY_REFLECTION_TAPS)
    .map((reflection) => {
      const material = materialForHybridReflection(reflection.materialId);
      const amplitude = specularReflectionAmplitude(material, "mid") * distanceAttenuation(reflection.pathLengthM);
      return {
        id: reflection.id,
        position: reflection.reflectionPoint,
        delayMs: reflection.delayMs,
        gainDb: linearToDb(amplitude),
        lowpassHz: lowpassHz(material),
      };
    });
}
