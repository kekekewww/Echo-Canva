import { describe, expect, it } from "vitest";

import {
  MAX_HYBRID_EARLY_REFLECTION_TAPS,
  renderHybridEarlyReflections,
} from "@/acoustics/hybrid3d/reflection-rendering";
import { MATERIALS } from "@/domain/materials/registry";
import type { FirstOrderReflection3D } from "@/acoustics/hybrid3d/reflections";
import type { SecondOrderReflection3D } from "@/acoustics/hybrid3d/second-order";

function reflection(
  id: string,
  materialId: string,
  pathLengthM: number,
): FirstOrderReflection3D {
  return {
    id,
    surfaceId: id.replace("first:", ""),
    patchId: id.replace("first:", ""),
    materialId,
    reflectionPoint: { x: pathLengthM, y: 2, z: 1 },
    pathLengthM,
    delayMs: pathLengthM * 3,
    excessDelayMs: 1,
    arrivalDirection: { x: 0, y: 1, z: 0 },
  };
}

function secondOrderReflection(): SecondOrderReflection3D {
  return {
    id: "second:floor>partition_center",
    surfaceIds: ["floor", "partition_center"],
    patchIds: ["floor", "partition_center:front"],
    materialIds: ["concrete_hard", "wood_medium"],
    reflectionPoints: [{ x: 2, y: 0, z: 2 }, { x: 5, y: 1.5, z: 4 }],
    pathLengthM: 9,
    delayMs: 26,
    excessDelayMs: 8,
    estimatedMidGainDb: -20,
    arrivalDirection: { x: 1, y: 0, z: 0 },
  };
}

describe("Hybrid 3D reflection rendering", () => {
  it("turns material-aware finite paths into delay, gain, filter, and 3D position taps", () => {
    const [concrete, treatment] = renderHybridEarlyReflections([
      reflection("first:concrete", "concrete_hard", 5),
      reflection("first:treatment", "acoustic_treatment", 6),
    ]);

    expect(concrete).toMatchObject({
      id: "first:concrete",
      position: { x: 5, y: 2, z: 1 },
      delayMs: 15,
    });
    expect(concrete?.gainDb).toBeLessThan(-13);
    expect(concrete?.gainDb).toBeGreaterThan(-15);
    expect(treatment?.gainDb).toBeLessThan(concrete?.gainDb ?? 0);
    expect(treatment?.lowpassHz).toBeLessThan(concrete?.lowpassHz ?? 20_000);
  });

  it("keeps a stable path order and never exceeds the fixed six-tap bank", () => {
    const taps = renderHybridEarlyReflections(Array.from(
      { length: MAX_HYBRID_EARLY_REFLECTION_TAPS + 2 },
      (_, index) => reflection(`first:wall-${index}`, "concrete_hard", 20 - index),
    ));

    expect(taps).toHaveLength(MAX_HYBRID_EARLY_REFLECTION_TAPS);
    expect(taps[0]?.id).toBe("first:wall-7");
    expect(taps.at(-1)?.id).toBe("first:wall-2");
  });

  it("uses the specular rather than total reflected energy for treated surfaces", () => {
    const [tap] = renderHybridEarlyReflections([
      reflection("first:treatment", "acoustic_treatment", 5),
    ]);
    const material = MATERIALS.find(({ id }) => id === "acoustic_treatment")!;
    const reflectedEnergy = 1 - material.absorption.mid - 10 ** (-material.transmissionLossDb.mid / 10);
    const specularAmplitude = Math.sqrt(reflectedEnergy * (1 - material.scattering));

    expect(tap?.gainDb).toBeCloseTo(20 * Math.log10(specularAmplitude / 5));
  });

  it("renders a second-order path from its listener-facing reflection point", () => {
    const taps = renderHybridEarlyReflections([], [secondOrderReflection()]);

    expect(taps).toEqual([expect.objectContaining({
      id: "second:floor>partition_center",
      order: 2,
      position: { x: 5, y: 1.5, z: 4 },
      delayMs: 26,
      gainDb: -20,
    })]);
  });
});
