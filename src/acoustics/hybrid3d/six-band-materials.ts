import type { AcousticMaterial } from "@/domain/materials/registry";
import type { Band3 } from "@/domain/scene/types";

const ENERGY_EPSILON = 1e-8;

export const HYBRID_SIX_BANDS = [
  { id: "125Hz", frequencyHz: 125 },
  { id: "250Hz", frequencyHz: 250 },
  { id: "500Hz", frequencyHz: 500 },
  { id: "1000Hz", frequencyHz: 1000 },
  { id: "2000Hz", frequencyHz: 2000 },
  { id: "4000Hz", frequencyHz: 4000 },
] as const;

export type HybridSixBandId = (typeof HYBRID_SIX_BANDS)[number]["id"];

export type HybridSixBandValues = Readonly<Record<HybridSixBandId, number>>;

export type HybridSixBandMaterial = Readonly<{
  id: string;
  displayName: string;
  absorption: HybridSixBandValues;
  transmissionLossDb: HybridSixBandValues;
  scattering: HybridSixBandValues;
  referenceThicknessM: number;
  source: "v1-log-frequency-projection";
}>;

export type HybridBandEnergy = Readonly<{
  absorption: number;
  transmission: number;
  reflection: number;
  specular: number;
  diffuse: number;
  total: number;
}>;

const THREE_BAND_ANCHORS = [
  { key: "low", frequencyHz: 250 },
  { key: "mid", frequencyHz: 1000 },
  { key: "high", frequencyHz: 4000 },
] as const satisfies readonly { key: keyof Band3; frequencyHz: number }[];

/**
 * Projects an existing Low/Mid/High value over the Hybrid bands on a log-frequency axis.
 * Values below/above the legacy anchors intentionally remain clamped to preserve the v1 edges.
 */
export function interpolateLegacyBandLogFrequency(
  value: Readonly<Band3>,
  frequencyHz: number,
): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    throw new Error("Hybrid material frequency must be finite and greater than zero.");
  }
  const first = THREE_BAND_ANCHORS[0]!;
  const last = THREE_BAND_ANCHORS[THREE_BAND_ANCHORS.length - 1]!;
  if (frequencyHz <= first.frequencyHz) return value[first.key];
  if (frequencyHz >= last.frequencyHz) return value[last.key];

  const upperIndex = THREE_BAND_ANCHORS.findIndex(({ frequencyHz: anchorFrequency }) =>
    frequencyHz <= anchorFrequency,
  );
  const upper = THREE_BAND_ANCHORS[upperIndex]!;
  const lower = THREE_BAND_ANCHORS[upperIndex - 1]!;
  const amount = (Math.log2(frequencyHz) - Math.log2(lower.frequencyHz)) /
    (Math.log2(upper.frequencyHz) - Math.log2(lower.frequencyHz));
  return value[lower.key] + (value[upper.key] - value[lower.key]) * amount;
}

function projectLegacyBand(value: Readonly<Band3>): HybridSixBandValues {
  return Object.freeze(Object.fromEntries(HYBRID_SIX_BANDS.map(({ id, frequencyHz }) => [
    id,
    interpolateLegacyBandLogFrequency(value, frequencyHz),
  ])) as Record<HybridSixBandId, number>);
}

function constantBand(value: number): HybridSixBandValues {
  return Object.freeze(Object.fromEntries(HYBRID_SIX_BANDS.map(({ id }) => [id, value])) as Record<HybridSixBandId, number>);
}

export function projectMaterialToHybridSixBands(material: AcousticMaterial): HybridSixBandMaterial {
  const projected: HybridSixBandMaterial = Object.freeze({
    id: material.id,
    displayName: material.displayName,
    absorption: projectLegacyBand(material.absorption),
    transmissionLossDb: projectLegacyBand(material.transmissionLossDb),
    scattering: constantBand(material.scattering),
    referenceThicknessM: material.referenceThicknessM,
    source: "v1-log-frequency-projection",
  });
  assertHybridSixBandMaterialEnergy(projected);
  return projected;
}

export function hybridBandEnergy(material: HybridSixBandMaterial, band: HybridSixBandId): HybridBandEnergy {
  const absorption = material.absorption[band];
  const transmission = 10 ** (-material.transmissionLossDb[band] / 10);
  const reflection = Math.max(0, 1 - absorption - transmission);
  const scattering = material.scattering[band];
  const specular = reflection * (1 - scattering);
  const diffuse = reflection * scattering;
  return { absorption, transmission, reflection, specular, diffuse, total: absorption + transmission + specular + diffuse };
}

export function assertHybridSixBandMaterialEnergy(material: HybridSixBandMaterial): void {
  for (const { id } of HYBRID_SIX_BANDS) {
    const energy = hybridBandEnergy(material, id);
    if (
      !Number.isFinite(energy.total) ||
      energy.absorption < 0 || energy.absorption > 1 ||
      energy.transmission < 0 || energy.transmission > 1 ||
      material.scattering[id] < 0 || material.scattering[id] > 1 ||
      Math.abs(energy.total - 1) > ENERGY_EPSILON
    ) {
      throw new Error(`Hybrid six-band material energy is invalid for ${material.id}.${id}.`);
    }
  }
}
