import { describe, expect, it } from "vitest";

import {
  findFirstOrderReflections,
  solveSecondOrderReflectionPair2D,
} from "@/acoustics/image-source";
import { MATERIALS } from "@/domain/materials/registry";
import type { SceneSpec } from "@/domain/scene/types";

function reflectionScene(walls: SceneSpec["walls"]): SceneSpec {
  return {
    schemaVersion: "1.0",
    revision: 1,
    units: "m",
    name: "Reflection test room",
    room: {
      outerPolygon: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      heightM: 3,
      floorMaterialId: "concrete_hard",
      ceilingMaterialId: "concrete_hard",
    },
    walls,
    portals: [],
    sources: [],
    listener: { position: { x: 8, y: 2 }, headingDeg: 0 },
    settings: { acousticUpdateHz: 12, maxEarlyReflections: 6, hrtfEnabled: true },
  };
}

const RECTANGLE_WALLS: SceneSpec["walls"] = [
  { id: "bottom", a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
  { id: "right", a: { x: 10, y: 0 }, b: { x: 10, y: 10 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
  { id: "top", a: { x: 10, y: 10 }, b: { x: 0, y: 10 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
  { id: "left", a: { x: 0, y: 10 }, b: { x: 0, y: 0 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
];

describe("findFirstOrderReflections", () => {
  it("constructs a finite bottom-wall image-source reflection", () => {
    const reflections = findFirstOrderReflections(
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      reflectionScene(RECTANGLE_WALLS),
      6,
    );

    const bottom = reflections.find((reflection) => reflection.wallId === "bottom");

    expect(bottom).toMatchObject({
      wallId: "bottom",
      reflectionPoint: { x: 5, y: 0 },
    });
    expect(bottom?.pathLengthM).toBeCloseTo(2 * Math.sqrt(13));
    expect(bottom?.delayMs).toBeCloseTo(((2 * Math.sqrt(13) - 6) / 343) * 1000);
    const midReflectionAmplitude = Math.sqrt((1 - 0.04 - 10 ** (-34 / 10)) * (1 - 0.08));
    const highReflectionAmplitude = Math.sqrt((1 - 0.03 - 10 ** (-40 / 10)) * (1 - 0.08));
    expect(bottom?.gainDb).toBeCloseTo(20 * Math.log10(midReflectionAmplitude / (2 * Math.sqrt(13))));
    expect(bottom?.lowpassHz).toBeCloseTo(
      700 * (20_000 / 700) ** Math.min(1, highReflectionAmplitude / midReflectionAmplitude),
    );
  });

  it("uses only the material's specular energy for a treated-wall tap", () => {
    const walls = RECTANGLE_WALLS.map((wall) => ({ ...wall, materialId: "acoustic_treatment" }));
    const bottom = findFirstOrderReflections(
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      reflectionScene(walls),
      6,
    ).find((reflection) => reflection.wallId === "bottom");
    const material = MATERIALS.find(({ id }) => id === "acoustic_treatment")!;
    const reflectedEnergy = 1 - material.absorption.mid - 10 ** (-material.transmissionLossDb.mid / 10);
    const specularAmplitude = Math.sqrt(reflectedEnergy * (1 - material.scattering));

    expect(bottom?.gainDb).toBeCloseTo(
      20 * Math.log10(specularAmplitude / (2 * Math.sqrt(13))),
    );
  });

  it("rejects a candidate whose source leg is occluded by another wall", () => {
    const reflections = findFirstOrderReflections(
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      reflectionScene([
        ...RECTANGLE_WALLS,
        { id: "blocker", a: { x: 3, y: 0.2 }, b: { x: 3, y: 4 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "partition" },
      ]),
      6,
    );

    expect(reflections.map((reflection) => reflection.wallId)).not.toContain("bottom");
  });

  it("rejects a reflection leg that overlaps a collinear obstacle", () => {
    const reflections = findFirstOrderReflections(
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      reflectionScene([
        ...RECTANGLE_WALLS,
        { id: "collinear-blocker", a: { x: 3, y: 4 / 3 }, b: { x: 4, y: 2 / 3 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "partition" },
      ]),
      6,
    );

    expect(reflections.map((reflection) => reflection.wallId)).not.toContain("bottom");
  });

  it("rejects a shared wall endpoint at the reflection point", () => {
    const reflections = findFirstOrderReflections(
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      reflectionScene([
        ...RECTANGLE_WALLS,
        { id: "shared-corner", a: { x: 5, y: 0 }, b: { x: 5, y: 4 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "partition" },
      ]),
      6,
    );

    expect(reflections.map((reflection) => reflection.wallId)).not.toContain("bottom");
  });

  it("rejects a near-parallel image-to-listener line without numerical ghost taps", () => {
    const reflections = findFirstOrderReflections(
      { x: 2, y: 2 },
      { x: 8, y: -1.999999999 },
      reflectionScene([
        { id: "near-parallel", a: { x: 0, y: 0 }, b: { x: 10, y: 0.000000001 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
      ]),
      6,
    );

    expect(reflections).toEqual([]);
  });

  it("ignores zero-length walls", () => {
    const reflections = findFirstOrderReflections(
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      reflectionScene([
        ...RECTANGLE_WALLS,
        { id: "zero", a: { x: 5, y: 0 }, b: { x: 5, y: 0 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "partition" },
      ]),
      6,
    );

    expect(reflections.map((reflection) => reflection.wallId)).not.toContain("zero");
  });

  it("orders equivalent candidates by wall ID and caps the result at six taps", () => {
    const vertices = [
      { x: -5, y: -2 }, { x: -2, y: -5 }, { x: 2, y: -5 }, { x: 5, y: -2 },
      { x: 5, y: 2 }, { x: 2, y: 5 }, { x: -2, y: 5 }, { x: -5, y: 2 },
    ];
    const walls = vertices.map((a, index) => ({
      id: `wall-${String(8 - index).padStart(2, "0")}`,
      a,
      b: vertices[(index + 1) % vertices.length]!,
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "boundary" as const,
    }));

    const reflections = findFirstOrderReflections(
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      reflectionScene(walls),
      99,
    );

    expect(reflections).toHaveLength(6);
    expect(reflections.map((reflection) => reflection.gainDb)).toEqual(
      [...reflections.map((reflection) => reflection.gainDb)].sort((a, b) => b - a),
    );
    for (let index = 1; index < reflections.length; index += 1) {
      const previous = reflections[index - 1]!;
      const current = reflections[index]!;
      if (Math.abs(previous.gainDb - current.gainDb) < 1e-10) {
        expect(previous.wallId.localeCompare(current.wallId)).toBeLessThan(0);
      }
    }
    expect(findFirstOrderReflections({ x: -1, y: 0 }, { x: 1, y: 0 }, reflectionScene(walls), 99))
      .toEqual(reflections);
  });
});

describe("solveSecondOrderReflectionPair2D", () => {
  it("rejects an ordered pair when an intervening obstacle crosses the middle leg", () => {
    const blocker = {
      id: "middle_leg_blocker",
      a: { x: 8.5, y: 1.2 },
      b: { x: 8.5, y: 1.8 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "partition" as const,
    };
    const scene = reflectionScene([...RECTANGLE_WALLS, blocker]);

    expect(solveSecondOrderReflectionPair2D(
      { x: 2, y: 5 },
      { x: 8, y: 5 },
      RECTANGLE_WALLS[0]!,
      RECTANGLE_WALLS[1]!,
      scene,
    )).toBeNull();
  });
});
