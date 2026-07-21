import { describe, expect, it } from "vitest";

import { buildPatchBvh } from "@/acoustics/hybrid3d/bvh";
import { makePatch3 } from "@/acoustics/hybrid3d/geometry";
import {
  benchmarkReceiverConnectionBudgets,
  benchmarkReceiverConnectionStationary,
} from "@/acoustics/hybrid3d/receiver-connection-benchmark";

function shoeboxBvh() {
  const floor = makePatch3("floor", "floor", "concrete_hard", [
    { x: -4, y: 0, z: -4 }, { x: 8, y: 0, z: -4 }, { x: 8, y: 0, z: 4 }, { x: -4, y: 0, z: 4 },
  ]);
  const ceiling = makePatch3("ceiling", "ceiling", "concrete_hard", [
    { x: -4, y: 3, z: -4 }, { x: -4, y: 3, z: 4 }, { x: 8, y: 3, z: 4 }, { x: 8, y: 3, z: -4 },
  ]);
  const north = makePatch3("north", "wall", "concrete_hard", [
    { x: -4, y: 0, z: 4 }, { x: 8, y: 0, z: 4 }, { x: 8, y: 3, z: 4 }, { x: -4, y: 3, z: 4 },
  ]);
  const south = makePatch3("south", "wall", "concrete_hard", [
    { x: 8, y: 0, z: -4 }, { x: -4, y: 0, z: -4 }, { x: -4, y: 3, z: -4 }, { x: 8, y: 3, z: -4 },
  ]);
  return buildPatchBvh([floor, ceiling, north, south]);
}

describe("Hybrid 3D receiver-connection benchmark", () => {
  const input = {
    sceneSignature: "stationary-shoebox",
    source: { x: 1, y: 1.2, z: 0 },
    listener: { x: 4, y: 1.5, z: 0.5 },
    bvh: shoeboxBvh(),
    sampledDirectionCount: 128,
    frameCount: 10,
  } as const;

  it("is deterministic and reports normalized stationary-frame metrics", () => {
    const first = benchmarkReceiverConnectionStationary(input);
    const repeated = benchmarkReceiverConnectionStationary(input);

    expect(repeated).toEqual(first);
    expect(first.frames).toHaveLength(10);
    expect(first.progressive).toMatchObject({
      sceneSignature: "stationary-shoebox",
      frameCount: 10,
      sampledDirectionCount: 1280,
    });
    expect(first.metrics).toMatchObject({
      frameCount: 10,
      sampledDirectionCount: 128,
      totalSampleCount: 1280,
    });
    expect(first.metrics.totalConnectionCount).toBeGreaterThan(0);
    expect(first.metrics.connectionRate).toBeGreaterThan(0);
    expect(first.metrics.connectionRate).toBeLessThanOrEqual(1);
    expect(first.metrics.meanMidEnergyPerDirection).toBeGreaterThan(0);
    expect(first.metrics.frameEnergyCoefficientOfVariation).toBeGreaterThanOrEqual(0);
    expect(first.metrics.p95FrameToFrameEnergyDeltaDb).toBeGreaterThanOrEqual(0);
    expect(first.frames.every(({ midEnergyPerDirection }) => Number.isFinite(midEnergyPerDirection))).toBe(true);
  });

  it("supports fixed-budget comparisons without treating an empty scene as NaN", () => {
    const sweep = benchmarkReceiverConnectionBudgets(input, [32, 64]);
    expect(sweep.map(({ metrics }) => metrics.sampledDirectionCount)).toEqual([32, 64]);
    expect(sweep.every(({ metrics }) => metrics.totalSampleCount === metrics.frameCount * metrics.sampledDirectionCount)).toBe(true);

    const empty = benchmarkReceiverConnectionStationary({
      ...input,
      sceneSignature: "empty",
      bvh: buildPatchBvh([]),
      frameCount: 1,
    });
    expect(empty.metrics).toMatchObject({
      totalConnectionCount: 0,
      connectionRate: 0,
      meanMidEnergyPerDirection: 0,
      frameEnergyCoefficientOfVariation: 0,
      p95FrameToFrameEnergyDeltaDb: 0,
    });
  });

  it("rejects invalid stationary-frame configurations", () => {
    expect(() => benchmarkReceiverConnectionStationary({ ...input, frameCount: 0 })).toThrow(/1 to 120/i);
    expect(() => benchmarkReceiverConnectionStationary({ ...input, startFrameIndex: -1 })).toThrow(/non-negative/i);
    expect(() => benchmarkReceiverConnectionBudgets(input, [])).toThrow(/at least one/i);
  });
});
