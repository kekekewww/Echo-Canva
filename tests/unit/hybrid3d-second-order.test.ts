import { describe, expect, it } from "vitest";

import { buildPatchBvh } from "@/acoustics/hybrid3d/bvh";
import { makePatch3 } from "@/acoustics/hybrid3d/geometry";
import {
  findExhaustiveSecondOrderReflections3D,
  findPrunedSecondOrderReflections3D,
} from "@/acoustics/hybrid3d/second-order";
import { evaluateSecondOrderCandidate } from "@/acoustics/hybrid3d/second-order-evaluation";

function closeTo(actual: number, expected: number, tolerance = 1e-5): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function floorAndCeiling() {
  const floor = makePatch3("floor", "floor", "concrete_hard", [
    { x: -4, y: 0, z: -4 }, { x: 8, y: 0, z: -4 }, { x: 8, y: 0, z: 4 }, { x: -4, y: 0, z: 4 },
  ]);
  const ceiling = makePatch3("ceiling", "ceiling", "concrete_hard", [
    { x: -4, y: 3, z: -4 }, { x: -4, y: 3, z: 4 }, { x: 8, y: 3, z: 4 }, { x: 8, y: 3, z: -4 },
  ]);
  return buildPatchBvh([floor, ceiling]);
}

function mediumPruningFixture() {
  const floor = makePatch3("floor", "floor", "concrete_hard", [
    { x: -4, y: 0, z: -4 }, { x: 8, y: 0, z: -4 }, { x: 8, y: 0, z: 4 }, { x: -4, y: 0, z: 4 },
  ]);
  const ceiling = makePatch3("ceiling", "ceiling", "concrete_hard", [
    { x: -4, y: 3, z: -4 }, { x: -4, y: 3, z: 4 }, { x: 8, y: 3, z: 4 }, { x: 8, y: 3, z: -4 },
  ]);
  const distantPatches = Array.from({ length: 30 }, (_, index) => {
    const x = 60 + index * 4;
    return makePatch3(`distant-${index}`, "wall", "concrete_hard", [
      { x, y: 0, z: -1 }, { x, y: 0, z: 1 }, { x, y: 3, z: 1 }, { x, y: 3, z: -1 },
    ]);
  });
  return buildPatchBvh([floor, ceiling, ...distantPatches]);
}

describe("Hybrid 3D second-order Image Source branches", () => {
  it("uses the exhaustive oracle to solve ordered floor-to-ceiling reflections", () => {
    const paths = findExhaustiveSecondOrderReflections3D(
      { x: 1, y: 1, z: 0 },
      { x: 4, y: 1, z: 0 },
      floorAndCeiling(),
    );
    const floorThenCeiling = paths.find(({ id }) => id === "second:floor>ceiling");

    expect(paths).toHaveLength(2);
    expect(floorThenCeiling?.reflectionPoints).toEqual([
      { x: 1.5, y: 0, z: 0 },
      { x: 3, y: 3, z: 0 },
    ]);
    closeTo(floorThenCeiling?.pathLengthM ?? Number.NaN, Math.sqrt(45));
    closeTo(
      floorThenCeiling?.delayMs ?? Number.NaN,
      (Math.sqrt(45) / 343) * 1000,
      0.00001,
    );
    expect(floorThenCeiling?.estimatedMidGainDb).toBeLessThan(-16);
  });

  it("matches the exhaustive branch when pruning thresholds retain all valid paths", () => {
    const source = { x: 1, y: 1, z: 0 };
    const listener = { x: 4, y: 1, z: 0 };
    const bvh = floorAndCeiling();
    const reference = findExhaustiveSecondOrderReflections3D(source, listener, bvh);
    const candidate = findPrunedSecondOrderReflections3D(source, listener, bvh, {
      maxPathLengthM: 20,
      minEstimatedGainDb: -80,
      maxCandidates: 8,
    });

    expect(candidate.paths.map(({ id }) => id)).toEqual(reference.map(({ id }) => id));
    expect(candidate.paths.map(({ delayMs }) => delayMs)).toEqual(reference.map(({ delayMs }) => delayMs));
    expect(candidate.stats).toMatchObject({ orderedPairs: 2, evaluatedPairs: 2, validPaths: 2 });
    expect(evaluateSecondOrderCandidate(reference, candidate.paths)).toMatchObject({
      recall: 1,
      precision: 1,
      delayRmseMs: 0,
      retainedMidEnergyRatio: 1,
    });
  });

  it("prunes bounded paths before finite-patch and visibility work without enabling the runtime flag", () => {
    const candidate = findPrunedSecondOrderReflections3D(
      { x: 1, y: 1, z: 0 },
      { x: 4, y: 1, z: 0 },
      floorAndCeiling(),
      { maxPathLengthM: 5, minEstimatedGainDb: -80 },
    );

    expect(candidate.paths).toEqual([]);
    expect(candidate.stats).toMatchObject({ orderedPairs: 2, pathLengthPruned: 2, evaluatedPairs: 0 });
  });

  it("retains all relevant paths while pruning more than three times the expensive pair work in a 32-patch fixture", () => {
    const source = { x: 1, y: 1, z: 0 };
    const listener = { x: 4, y: 1, z: 0 };
    const bvh = mediumPruningFixture();
    const reference = findExhaustiveSecondOrderReflections3D(source, listener, bvh);
    const candidate = findPrunedSecondOrderReflections3D(source, listener, bvh, {
      maxPathLengthM: 20,
      minEstimatedGainDb: -80,
      maxCandidates: 8,
    });
    const metrics = evaluateSecondOrderCandidate(reference, candidate.paths);

    expect(metrics).toMatchObject({ recall: 1, precision: 1, delayRmseMs: 0, retainedMidEnergyRatio: 1 });
    expect(candidate.stats.orderedPairs / candidate.stats.evaluatedPairs).toBeGreaterThanOrEqual(3);
    expect(candidate.stats.pathLengthPruned).toBeGreaterThan(0);
  });

  it("bounds runtime ordered-pair growth with a deterministic representative-surface budget", () => {
    const candidate = findPrunedSecondOrderReflections3D(
      { x: 1, y: 1, z: 0 },
      { x: 4, y: 1, z: 0 },
      mediumPruningFixture(),
      {
        maxPathLengthM: 200,
        minEstimatedGainDb: -120,
        maxCandidates: 6,
        maxRepresentativePatches: 8,
      },
    );

    expect(candidate.stats.consideredPatches).toBe(8);
    expect(candidate.stats.orderedPairs).toBeLessThanOrEqual(8 * 7);
  });
});
