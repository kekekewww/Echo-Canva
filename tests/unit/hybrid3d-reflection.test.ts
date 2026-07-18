import { describe, expect, it } from "vitest";

import { buildPatchBvh } from "@/acoustics/hybrid3d/bvh";
import { findFirstOrderReflections3D } from "@/acoustics/hybrid3d/reflections";
import { makePatch3 } from "@/acoustics/hybrid3d/geometry";

function closeTo(actual: number, expected: number, tolerance = 1e-5): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe("Hybrid 3D first-order image-source reflections", () => {
  it("solves the G002 floor reflection", () => {
    const floor = makePatch3("floor", "floor", "concrete_hard", [
      { x: -4, y: 0, z: -4 }, { x: 8, y: 0, z: -4 }, { x: 8, y: 0, z: 4 }, { x: -4, y: 0, z: 4 },
    ]);
    const paths = findFirstOrderReflections3D(
      { x: 0, y: 1, z: 0 },
      { x: 4, y: 1, z: 0 },
      buildPatchBvh([floor]),
    );
    const path = paths[0]!;

    expect(paths).toHaveLength(1);
    expect(path.surfaceId).toBe("floor");
    expect(path.reflectionPoint).toEqual({ x: 2, y: 0, z: 0 });
    closeTo(path.pathLengthM, Math.sqrt(20));
    closeTo(path.delayMs, 13.0382972449, 0.00001);
    closeTo(path.excessDelayMs, 1.3764896647, 0.00001);
  });

  it("solves the G003 ceiling and G004 vertical-wall reflections", () => {
    const ceiling = makePatch3("ceiling", "ceiling", "concrete_hard", [
      { x: -4, y: 3, z: -4 }, { x: -4, y: 3, z: 4 }, { x: 8, y: 3, z: 4 }, { x: 8, y: 3, z: -4 },
    ]);
    const ceilingPath = findFirstOrderReflections3D(
      { x: 0, y: 1, z: 0 },
      { x: 4, y: 1, z: 0 },
      buildPatchBvh([ceiling]),
    )[0]!;
    expect(ceilingPath.reflectionPoint).toEqual({ x: 2, y: 3, z: 0 });
    closeTo(ceilingPath.pathLengthM, Math.sqrt(32));
    closeTo(ceilingPath.delayMs, 16.4922864417, 0.00001);

    const wall = makePatch3("wall", "wall", "concrete_hard", [
      { x: 0, y: 0, z: -4 }, { x: 0, y: 3, z: -4 }, { x: 0, y: 3, z: 4 }, { x: 0, y: 0, z: 4 },
    ]);
    const wallPath = findFirstOrderReflections3D(
      { x: 1, y: 1.5, z: 0 },
      { x: 4, y: 1.5, z: 0 },
      buildPatchBvh([wall]),
    )[0]!;
    expect(wallPath.reflectionPoint).toEqual({ x: 0, y: 1.5, z: 0 });
    closeTo(wallPath.pathLengthM, 5);
    closeTo(wallPath.delayMs, 14.5772594752, 0.00001);
  });

  it("rejects a mirror hit outside the finite patch and an occluded reflection leg", () => {
    const tooSmallFloor = makePatch3("small-floor", "floor", "concrete_hard", [
      { x: -1, y: 0, z: -1 }, { x: 1, y: 0, z: -1 }, { x: 1, y: 0, z: 1 }, { x: -1, y: 0, z: 1 },
    ]);
    expect(findFirstOrderReflections3D(
      { x: 0, y: 1, z: 0 },
      { x: 4, y: 1, z: 0 },
      buildPatchBvh([tooSmallFloor]),
    )).toEqual([]);

    const floor = makePatch3("floor", "floor", "concrete_hard", [
      { x: -4, y: 0, z: -4 }, { x: 8, y: 0, z: -4 }, { x: 8, y: 0, z: 4 }, { x: -4, y: 0, z: 4 },
    ]);
    const blocker = makePatch3("blocker", "wall", "concrete_hard", [
      { x: 1, y: 0, z: -1 }, { x: 1, y: 2, z: -1 }, { x: 1, y: 2, z: 1 }, { x: 1, y: 0, z: 1 },
    ]);
    expect(findFirstOrderReflections3D(
      { x: 0, y: 1, z: 0 },
      { x: 4, y: 1, z: 0 },
      buildPatchBvh([floor, blocker]),
    )).toEqual([]);
  });
});
