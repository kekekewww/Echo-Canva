import type { AcousticMaterial } from "@/domain/materials/registry";
import { MATERIALS } from "@/domain/materials/registry";
import type { Band3 } from "@/domain/scene/types";

export function materialForHybridReflection(id: string): AcousticMaterial {
  const material = MATERIALS.find((candidate) => candidate.id === id);
  if (!material) throw new Error(`Unknown Hybrid reflection material: ${id}`);
  return material;
}

export function reflectionAmplitude(
  material: AcousticMaterial,
  band: keyof Band3,
): number {
  const transmittedEnergy = 10 ** (-material.transmissionLossDb[band] / 10);
  return Math.sqrt(Math.max(0, 1 - material.absorption[band] - transmittedEnergy));
}
