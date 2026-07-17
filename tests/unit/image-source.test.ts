import { describe, expect, it } from "vitest";

import { findFirstOrderReflections } from "@/acoustics/image-source";
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
    expect(bottom?.gainDb).toBeLessThan(0);
    expect(bottom?.lowpassHz).toBeGreaterThan(700);
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

  it("orders equivalent candidates by wall ID and caps the result at six taps", () => {
    const walls = Array.from({ length: 8 }, (_, index) => ({
      id: `wall-${String(8 - index).padStart(2, "0")}`,
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "boundary" as const,
    }));

    const reflections = findFirstOrderReflections(
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      reflectionScene(walls),
      99,
    );

    expect(reflections).toHaveLength(6);
    expect(reflections.map((reflection) => reflection.wallId)).toEqual([
      "wall-01",
      "wall-02",
      "wall-03",
      "wall-04",
      "wall-05",
      "wall-06",
    ]);
  });
});
