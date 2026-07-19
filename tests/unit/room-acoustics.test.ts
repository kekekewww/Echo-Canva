import { describe, expect, it } from "vitest";

import { estimateRoomAcoustics } from "@/acoustics/room-acoustics";
import type { SceneSpec } from "@/domain/scene/types";

function roomScene(overrides: Partial<SceneSpec> = {}): SceneSpec {
  const walls: SceneSpec["walls"] = [
    { id: "north", a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
    { id: "east", a: { x: 10, y: 0 }, b: { x: 10, y: 8 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
    { id: "south", a: { x: 10, y: 8 }, b: { x: 0, y: 8 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
    { id: "west", a: { x: 0, y: 8 }, b: { x: 0, y: 0 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
  ];

  return {
    schemaVersion: "1.0",
    revision: 1,
    units: "m",
    name: "Room test",
    room: {
      outerPolygon: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 8 },
        { x: 0, y: 8 },
      ],
      heightM: 3,
      floorMaterialId: "concrete_hard",
      ceilingMaterialId: "concrete_hard",
    },
    walls,
    portals: [],
    sources: [],
    listener: { position: { x: 5, y: 4 }, headingDeg: 0 },
    settings: { acousticUpdateHz: 12, maxEarlyReflections: 6, hrtfEnabled: true },
    ...overrides,
  };
}

describe("estimateRoomAcoustics", () => {
  it("uses shoelace floor area, perimeter wall area, and Eyring RT60", () => {
    const estimate = estimateRoomAcoustics(roomScene());

    expect(estimate.volumeM3).toBe(240);
    expect(estimate.totalSurfaceM2).toBe(268);
    expect(estimate.rt60S.mid).toBeCloseTo(0.161 * 240 / (-268 * Math.log(1 - 0.04)));
    expect(estimate.preDelayMs).toBeCloseTo((Math.sqrt(80) / 343) * 1000);
  });

  it("models an open portal area as additional energy escape", () => {
    const sealed = estimateRoomAcoustics(roomScene());
    const open = estimateRoomAcoustics(roomScene({
      portals: [{
        id: "door",
        wallId: "east",
        center: { x: 10, y: 4 },
        widthM: 1,
        heightM: 2.1,
        open: true,
        lossDb: 3,
      }],
    }));

    expect(open.totalSurfaceM2).toBe(sealed.totalSurfaceM2);
    expect(open.rt60S.low).toBeLessThan(sealed.rt60S.low);
    expect(open.rt60S.mid).toBeLessThan(sealed.rt60S.mid);
    expect(open.rt60S.high).toBeLessThan(sealed.rt60S.high);
  });

  it("treats a missing exterior boundary as full energy escape", () => {
    const sealed = estimateRoomAcoustics(roomScene());
    const estimate = estimateRoomAcoustics(roomScene({
      walls: [
        { id: "mismatched", a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, thicknessM: 0.2, materialId: "acoustic_treatment", kind: "boundary" },
      ],
    }));

    expect(estimate.totalSurfaceM2).toBe(268);
    expect(estimate.rt60S.mid).toBeLessThan(sealed.rt60S.mid);
  });

  it("treats a disabled ceiling as energy escape without changing room volume", () => {
    const sealed = estimateRoomAcoustics(roomScene());
    const open = estimateRoomAcoustics(roomScene(), { ceilingEnabled: false });

    expect(open.volumeM3).toBe(sealed.volumeM3);
    expect(open.totalSurfaceM2).toBe(sealed.totalSurfaceM2);
    expect(open.rt60S.mid).toBeLessThan(sealed.rt60S.mid);
  });

  it("clamps the numerical RT60 and pre-delay ranges", () => {
    const compact = roomScene({
      room: {
        outerPolygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        heightM: 3,
        floorMaterialId: "concrete_hard",
        ceilingMaterialId: "concrete_hard",
      },
    });
    const large = roomScene({
      room: {
        outerPolygon: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }],
        heightM: 3,
        floorMaterialId: "concrete_hard",
        ceilingMaterialId: "concrete_hard",
      },
    });

    expect(estimateRoomAcoustics(compact).preDelayMs).toBe(5);
    expect(estimateRoomAcoustics(large).preDelayMs).toBe(80);
    for (const value of Object.values(estimateRoomAcoustics(roomScene()).rt60S)) {
      expect(value).toBeGreaterThanOrEqual(0.12);
      expect(value).toBeLessThanOrEqual(4);
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
