import type { Band3 } from "@/domain/scene/types";
import { EPSILON } from "@/domain/scene/geometry-validation";

export type AcousticMaterial = Readonly<{
  id: string;
  displayName: string;
  absorption: Readonly<Band3>;
  transmissionLossDb: Readonly<Band3>;
  scattering: number;
  referenceThicknessM: number;
}>;

const BANDS = ["low", "mid", "high"] as const;

function defineMaterial(material: AcousticMaterial): AcousticMaterial {
  for (const band of BANDS) {
    const absorption = material.absorption[band];
    const transmissionLossDb = material.transmissionLossDb[band];
    const transmissionEnergy = 10 ** (-transmissionLossDb / 10);

    if (
      absorption < 0 ||
      absorption > 1 ||
      transmissionLossDb < 0 ||
      absorption + transmissionEnergy > 1 + EPSILON
    ) {
      throw new Error(`Invalid material energy for ${material.id}.${band}`);
    }
  }

  return Object.freeze({
    ...material,
    absorption: Object.freeze({ ...material.absorption }),
    transmissionLossDb: Object.freeze({ ...material.transmissionLossDb }),
  });
}

export const MATERIALS: readonly AcousticMaterial[] = Object.freeze([
  defineMaterial({
    id: "concrete_hard",
    displayName: "Hard concrete",
    absorption: { low: 0.05, mid: 0.04, high: 0.03 },
    transmissionLossDb: { low: 28, mid: 34, high: 40 },
    scattering: 0.08,
    referenceThicknessM: 0.2,
  }),
  defineMaterial({
    id: "soft_foliage",
    displayName: "Soft foliage",
    absorption: { low: 0.25, mid: 0.55, high: 0.75 },
    transmissionLossDb: { low: 8, mid: 10, high: 12 },
    scattering: 0.7,
    referenceThicknessM: 0.4,
  }),
  defineMaterial({
    id: "water_like",
    displayName: "Water-like surface",
    absorption: { low: 0.02, mid: 0.04, high: 0.06 },
    transmissionLossDb: { low: 12, mid: 16, high: 20 },
    scattering: 0.03,
    referenceThicknessM: 0.1,
  }),
  defineMaterial({
    id: "wood_medium",
    displayName: "Medium wood",
    absorption: { low: 0.12, mid: 0.18, high: 0.24 },
    transmissionLossDb: { low: 18, mid: 22, high: 26 },
    scattering: 0.2,
    referenceThicknessM: 0.12,
  }),
  defineMaterial({
    id: "acoustic_treatment",
    displayName: "Acoustic treatment",
    absorption: { low: 0.45, mid: 0.75, high: 0.9 },
    transmissionLossDb: { low: 12, mid: 16, high: 20 },
    scattering: 0.35,
    referenceThicknessM: 0.1,
  }),
]);
