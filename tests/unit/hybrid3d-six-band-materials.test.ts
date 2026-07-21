import { describe, expect, it } from "vitest";

import {
  airAbsorptionDbPerMeter,
  airAbsorptionLossDb,
  atmosphereTimeOfFlightSeconds,
  segmentedAtmosphereTimeOfFlightSeconds,
  speedOfSoundForAtmosphere,
} from "@/acoustics/hybrid3d/atmosphere";
import {
  assertHybridSixBandMaterialEnergy,
  hybridBandEnergy,
  interpolateLegacyBandLogFrequency,
  projectMaterialToHybridSixBands,
} from "@/acoustics/hybrid3d/six-band-materials";
import { MATERIALS } from "@/domain/materials/registry";

const concrete = MATERIALS.find(({ id }) => id === "concrete_hard")!;
const treatment = MATERIALS.find(({ id }) => id === "acoustic_treatment")!;
const neutralAir = { temperatureC: 20, relativeHumidity: 0.5, pressurePa: 101325 } as const;

describe("Hybrid 3D six-band materials and atmosphere", () => {
  it("projects the Classic three-band anchors exactly and interpolates in log frequency", () => {
    const projected = projectMaterialToHybridSixBands(concrete);

    expect(projected.absorption["125Hz"]).toBe(concrete.absorption.low);
    expect(projected.absorption["250Hz"]).toBe(concrete.absorption.low);
    expect(projected.absorption["1000Hz"]).toBe(concrete.absorption.mid);
    expect(projected.absorption["4000Hz"]).toBe(concrete.absorption.high);
    expect(projected.absorption["500Hz"]).toBeCloseTo((concrete.absorption.low + concrete.absorption.mid) * 0.5);
    expect(interpolateLegacyBandLogFrequency(concrete.absorption, 2000)).toBeCloseTo(
      (concrete.absorption.mid + concrete.absorption.high) * 0.5,
    );
    expect(projected.scattering["125Hz"]).toBe(concrete.scattering);
    expect(projected.scattering["4000Hz"]).toBe(concrete.scattering);
  });

  it("conserves material energy at every Hybrid band and distinguishes hard from treated surfaces", () => {
    const concreteBands = projectMaterialToHybridSixBands(concrete);
    const treatmentBands = projectMaterialToHybridSixBands(treatment);
    assertHybridSixBandMaterialEnergy(concreteBands);
    assertHybridSixBandMaterialEnergy(treatmentBands);

    const concreteHigh = hybridBandEnergy(concreteBands, "4000Hz");
    const treatmentHigh = hybridBandEnergy(treatmentBands, "4000Hz");
    expect(concreteHigh.total).toBeCloseTo(1, 12);
    expect(treatmentHigh.total).toBeCloseTo(1, 12);
    expect(concreteHigh.reflection).toBeGreaterThan(treatmentHigh.reflection);
    expect(concreteHigh.specular + concreteHigh.diffuse).toBeCloseTo(concreteHigh.reflection, 12);
  });

  it("uses the documented temperature time-of-flight anchors without changing Classic propagation", () => {
    const cold = { ...neutralAir, temperatureC: 0 };
    expect(speedOfSoundForAtmosphere(cold)).toBeCloseTo(331.3, 12);
    expect(speedOfSoundForAtmosphere(neutralAir)).toBeCloseTo(343.42, 12);
    expect(atmosphereTimeOfFlightSeconds(100, cold) * 1000).toBeCloseTo(301.8412315122, 8);
    expect(atmosphereTimeOfFlightSeconds(100, neutralAir) * 1000).toBeCloseTo(291.1886319958, 8);
    expect(segmentedAtmosphereTimeOfFlightSeconds([
      { distanceM: 50, atmosphere: cold },
      { distanceM: 50, atmosphere: neutralAir },
    ])).toBeCloseTo(
      atmosphereTimeOfFlightSeconds(50, cold) + atmosphereTimeOfFlightSeconds(50, neutralAir),
      12,
    );
  });

  it("keeps ISO-style air loss finite and monotonic with path length and high frequency", () => {
    const low100m = airAbsorptionLossDb(100, 250, neutralAir);
    const high100m = airAbsorptionLossDb(100, 4000, neutralAir);
    const high1000m = airAbsorptionLossDb(1000, 4000, neutralAir);

    expect(airAbsorptionDbPerMeter(4000, neutralAir)).toBeGreaterThan(0);
    expect(high100m).toBeGreaterThan(low100m);
    expect(high1000m).toBeCloseTo(high100m * 10, 10);
    expect(Number.isFinite(high1000m)).toBe(true);
  });

  it("rejects values outside the bounded Hybrid experiment envelope", () => {
    expect(() => projectMaterialToHybridSixBands(concrete)).not.toThrow();
    expect(() => airAbsorptionDbPerMeter(10, neutralAir)).toThrow(/20 to 20000/i);
    expect(() => airAbsorptionDbPerMeter(1000, { ...neutralAir, relativeHumidity: 1.1 })).toThrow(/0 to 1/i);
    expect(() => atmosphereTimeOfFlightSeconds(-1, neutralAir)).toThrow(/0 to 10000/i);
  });
});
