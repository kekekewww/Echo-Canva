import { describe, expect, it } from "vitest";

import { buildPatchBvh } from "@/acoustics/hybrid3d/bvh";
import { makePatch3 } from "@/acoustics/hybrid3d/geometry";
import {
  fibonacciSphereDirections,
  fibonacciProgressiveDirections,
  ProgressiveReceiverAccumulator,
  traceReceiverConnections3D,
} from "@/acoustics/hybrid3d/receiver-connection";

function floorBvh(withBlocker = false) {
  const floor = makePatch3("floor", "floor", "concrete_hard", [
    { x: -4, y: 0, z: -4 }, { x: 8, y: 0, z: -4 }, { x: 8, y: 0, z: 4 }, { x: -4, y: 0, z: 4 },
  ]);
  if (!withBlocker) return buildPatchBvh([floor]);
  const blocker = makePatch3("blocker", "wall", "concrete_hard", [
    { x: 0.5, y: 0, z: -1 }, { x: 0.5, y: 2, z: -1 },
    { x: 0.5, y: 2, z: 1 }, { x: 0.5, y: 0, z: 1 },
  ]);
  return buildPatchBvh([floor, blocker]);
}

describe("Hybrid 3D receiver connections", () => {
  it("generates deterministic normalized Fibonacci sphere directions", () => {
    const first = fibonacciSphereDirections(8, 0.25);
    expect(fibonacciSphereDirections(8, 0.25)).toEqual(first);
    expect(first).toHaveLength(8);
    for (const direction of first) {
      expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 12);
    }
    expect(() => fibonacciSphereDirections(0)).toThrow(/1 to 8192/i);
    expect(fibonacciProgressiveDirections(8, 0)).toEqual(fibonacciSphereDirections(8));
    expect(fibonacciProgressiveDirections(8, 1)).not.toEqual(fibonacciProgressiveDirections(8, 0));
    expect(() => fibonacciProgressiveDirections(8, -1)).toThrow(/non-negative/i);
  });

  it("connects a finite first hit to the receiver and rejects an occluded connection", () => {
    const source = { x: 0, y: 1, z: 0 };
    const listener = { x: 1, y: 1, z: 0 };
    const downward = [{ x: 0, y: -1, z: 0 }];
    const connections = traceReceiverConnections3D(source, listener, downward, floorBvh());

    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      id: "receiver:0:floor",
      point: { x: 0, y: 0, z: 0 },
    });
    expect(connections[0]?.pathLengthM).toBeCloseTo(1 + Math.sqrt(2));
    expect(connections[0]?.estimatedMidGainDb).toBeLessThan(-20);
    expect(traceReceiverConnections3D(
      source,
      listener,
      [{ x: 0, y: -2, z: 0 }],
      floorBvh(),
      1.5,
    )).toHaveLength(1);
    expect(traceReceiverConnections3D(
      source,
      listener,
      downward,
      floorBvh(),
      0.5,
    )).toEqual([]);
    expect(traceReceiverConnections3D(source, listener, downward, floorBvh(true))).toEqual([]);
  });

  it("accumulates deterministic energy and resets atomically for a new scene signature", () => {
    const accumulator = new ProgressiveReceiverAccumulator();
    const connections = traceReceiverConnections3D(
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      [{ x: 0, y: -1, z: 0 }],
      floorBvh(),
    );
    const first = accumulator.add("scene-a", 1, connections);
    const second = accumulator.add("scene-a", 1, connections);
    const reset = accumulator.add("scene-b", 1, connections);

    expect(first).toMatchObject({ frameCount: 1, sampledDirectionCount: 1, connectionCount: 1 });
    expect(second).toMatchObject({ frameCount: 2, sampledDirectionCount: 2, connectionCount: 2 });
    expect(second.accumulatedMidEnergy).toBeCloseTo(first.accumulatedMidEnergy * 2);
    expect(reset).toMatchObject({ sceneSignature: "scene-b", frameCount: 1, sampledDirectionCount: 1, connectionCount: 1 });
  });
});
