import { distanceAttenuation, linearToDb } from "@/audio/math";
import type { HybridEarlyReflectionTap } from "@/audio/types";

import {
  materialForHybridReflection,
  specularReflectionAmplitude,
} from "@/acoustics/hybrid3d/material-energy";
import type { FirstOrderReflection3D } from "@/acoustics/hybrid3d/reflections";
import type { SecondOrderReflection3D } from "@/acoustics/hybrid3d/second-order";

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
  secondOrderReflections: readonly SecondOrderReflection3D[] = [],
): readonly HybridEarlyReflectionTap[] {
  const firstOrderTaps = reflections.map((reflection): HybridEarlyReflectionTap => {
      const material = materialForHybridReflection(reflection.materialId);
      const amplitude = specularReflectionAmplitude(material, "mid") * distanceAttenuation(reflection.pathLengthM);
      return {
        id: reflection.id,
        order: 1,
        position: reflection.reflectionPoint,
        delayMs: reflection.delayMs,
        gainDb: linearToDb(amplitude),
        lowpassHz: lowpassHz(material),
      };
    });
  const secondOrderTaps = secondOrderReflections.map((reflection): HybridEarlyReflectionTap => ({
    id: reflection.id,
    order: 2,
    position: reflection.reflectionPoints[1],
    delayMs: reflection.delayMs,
    gainDb: reflection.estimatedMidGainDb,
    lowpassHz: Math.min(...reflection.materialIds.map((id) =>
      lowpassHz(materialForHybridReflection(id)))),
  }));

  return [...firstOrderTaps, ...secondOrderTaps]
    .sort((left, right) =>
      left.gainDb !== right.gainDb
        ? right.gainDb - left.gainDb
        : left.delayMs !== right.delayMs
          ? left.delayMs - right.delayMs
          : left.id.localeCompare(right.id),
    )
    .slice(0, MAX_HYBRID_EARLY_REFLECTION_TAPS);
}
