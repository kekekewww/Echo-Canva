import { distanceAttenuation, linearToDb } from "@/audio/math";
import type { HybridEarlyReflectionTap } from "@/audio/types";
import type { Band3 } from "@/domain/scene/types";
import { MATERIALS, type AcousticMaterial } from "@/domain/materials/registry";

import type { FirstOrderReflection3D } from "@/acoustics/hybrid3d/reflections";

export const MAX_HYBRID_EARLY_REFLECTION_TAPS = 6;

const MIN_LOWPASS_HZ = 800;
const MAX_LOWPASS_HZ = 20_000;

function materialFor(id: string): AcousticMaterial {
  const material = MATERIALS.find((candidate) => candidate.id === id);
  if (!material) throw new Error(`Unknown Hybrid reflection material: ${id}`);
  return material;
}

function reflectionAmplitude(material: AcousticMaterial, band: keyof Band3): number {
  const transmittedEnergy = 10 ** (-material.transmissionLossDb[band] / 10);
  return Math.sqrt(Math.max(0, 1 - material.absorption[band] - transmittedEnergy));
}

function lowpassHz(material: AcousticMaterial): number {
  const midAmplitude = reflectionAmplitude(material, "mid");
  if (midAmplitude <= 1e-8) return MIN_LOWPASS_HZ;
  const highToMidRatio = reflectionAmplitude(material, "high") / midAmplitude;
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
      const material = materialFor(reflection.materialId);
      const amplitude = reflectionAmplitude(material, "mid") * distanceAttenuation(reflection.pathLengthM);
      return {
        id: reflection.id,
        position: reflection.reflectionPoint,
        delayMs: reflection.delayMs,
        gainDb: linearToDb(amplitude),
        lowpassHz: lowpassHz(material),
      };
    });
}
