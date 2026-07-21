import { describe, expect, it } from "vitest";

import {
  buildDirectionalLateFieldHistogram,
} from "@/acoustics/hybrid3d/directional-late-field";
import type { ReceiverConnection3D } from "@/acoustics/hybrid3d/receiver-connection";

function connection(
  id: string,
  arrivalDirection: ReceiverConnection3D["arrivalDirection"],
  delayMs: number,
  estimatedMidGainDb: number,
): ReceiverConnection3D {
  return {
    id,
    sampleIndex: 0,
    surfaceId: "floor",
    point: { x: 0, y: 0, z: 0 },
    pathLengthM: 3,
    delayMs,
    arrivalDirection,
    estimatedMidGainDb,
  };
}

describe("Hybrid 3D directional late-field histogram", () => {
  const connections = [
    connection("east-early", { x: 1, y: 0, z: 0 }, 12, -20),
    connection("west-later", { x: -1, y: 0, z: 0 }, 39, -40),
    connection("east-second", { x: 1, y: 0, z: 0 }, 15, -20),
  ] as const;

  it("bins P5 connections deterministically by time and nearest virtual direction", () => {
    const histogram = buildDirectionalLateFieldHistogram(connections, {
      directionCount: 12,
      timeBinMs: 10,
      maximumDelayMs: 100,
    });

    expect(buildDirectionalLateFieldHistogram([...connections].reverse(), {
      directionCount: 12,
      timeBinMs: 10,
      maximumDelayMs: 100,
    })).toEqual(histogram);
    expect(histogram).toMatchObject({
      inputConnectionCount: 3,
      retainedConnectionCount: 3,
      discardedConnectionCount: 0,
      directionCount: 12,
      timeBinMs: 10,
    });
    expect(histogram.cells).toHaveLength(2);
    expect(histogram.cells.map(({ timeBinIndex }) => timeBinIndex)).toEqual([1, 3]);
    expect(histogram.cells[0]).toMatchObject({ connectionCount: 2, startDelayMs: 10, endDelayMs: 20 });
    expect(histogram.retainedMidEnergy).toBeCloseTo(0.0201, 12);
    expect(histogram.directionalEnergyCentroid?.x).toBeGreaterThan(0.9);
  });

  it("accounts for filtered delays without inventing late energy", () => {
    const histogram = buildDirectionalLateFieldHistogram(connections, {
      minimumDelayMs: 20,
      maximumDelayMs: 40,
      timeBinMs: 10,
    });
    expect(histogram).toMatchObject({
      retainedConnectionCount: 1,
      discardedConnectionCount: 2,
    });
    expect(histogram.cells).toHaveLength(1);
    expect(histogram.retainedMidEnergy).toBeCloseTo(0.0001, 12);
    expect(histogram.directionalEnergyCentroid?.x).toBeLessThan(-0.9);
  });

  it("returns finite empty output and rejects invalid renderer-facing configuration", () => {
    const empty = buildDirectionalLateFieldHistogram([], { directionCount: 24 });
    expect(empty).toMatchObject({
      inputConnectionCount: 0,
      retainedConnectionCount: 0,
      discardedConnectionCount: 0,
      retainedMidEnergy: 0,
      directionalEnergyCentroid: null,
      cells: [],
    });
    expect(() => buildDirectionalLateFieldHistogram([], { directionCount: 13 as 12 })).toThrow(/12 or 24/i);
    expect(() => buildDirectionalLateFieldHistogram([], { timeBinMs: 0 })).toThrow(/time bin/i);
    expect(() => buildDirectionalLateFieldHistogram([], { minimumDelayMs: 10, maximumDelayMs: 10 })).toThrow(/delay range/i);
  });
});
