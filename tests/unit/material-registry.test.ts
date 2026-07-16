import { describe, expect, it } from "vitest";

import { AUDIO_ASSETS } from "@/domain/audio-assets/registry";
import { MATERIALS } from "@/domain/materials/registry";

const MATERIAL_IDS = [
  "concrete_hard",
  "soft_foliage",
  "water_like",
  "wood_medium",
  "acoustic_treatment",
] as const;

const AUDIO_ASSET_IDS = [
  "radio_loop",
  "rain_loop",
  "voice_loop",
  "water_loop",
] as const;

describe("material registry", () => {
  it("contains exactly the built-in perceptually tuned material IDs", () => {
    expect(MATERIALS.map((material) => material.id)).toEqual(MATERIAL_IDS);
  });

  it("satisfies absorption and transmission energy constraints in every band", () => {
    for (const material of MATERIALS) {
      for (const band of ["low", "mid", "high"] as const) {
        const absorption = material.absorption[band];
        const transmissionEnergy = 10 ** (-material.transmissionLossDb[band] / 10);

        expect(absorption).toBeGreaterThanOrEqual(0);
        expect(absorption).toBeLessThanOrEqual(1);
        expect(material.transmissionLossDb[band]).toBeGreaterThanOrEqual(0);
        expect(absorption + transmissionEnergy).toBeLessThanOrEqual(1 + 1e-8);
      }
    }
  });

  it("is deeply immutable", () => {
    expect(Object.isFrozen(MATERIALS)).toBe(true);

    for (const material of MATERIALS) {
      expect(Object.isFrozen(material)).toBe(true);
      expect(Object.isFrozen(material.absorption)).toBe(true);
      expect(Object.isFrozen(material.transmissionLossDb)).toBe(true);
    }
  });
});

describe("audio asset registry", () => {
  it("contains exactly the approved mono asset IDs and local URLs", () => {
    expect(AUDIO_ASSETS.map((asset) => asset.id)).toEqual(AUDIO_ASSET_IDS);

    for (const asset of AUDIO_ASSETS) {
      expect(asset.url).toMatch(/^\/audio\/[a-z0-9-]+\.wav$/);
      expect(asset.url).not.toMatch(/^https?:\/\//);
      expect(asset.channels).toBe(1);
      expect(asset.license.length).toBeGreaterThan(0);
    }
  });

  it("is immutable", () => {
    expect(Object.isFrozen(AUDIO_ASSETS)).toBe(true);
    expect(AUDIO_ASSETS.every((asset) => Object.isFrozen(asset))).toBe(true);
  });
});
