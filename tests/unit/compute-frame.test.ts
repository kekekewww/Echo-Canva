import { describe, expect, it } from "vitest";

import { computeAcousticFrame } from "@/acoustics/compute-frame";
import type { SceneSpec } from "@/domain/scene/types";

const visibleScene: SceneSpec = {
  schemaVersion: "1.0",
  revision: 7,
  units: "m",
  name: "Visible source",
  room: {
    outerPolygon: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 6 },
      { x: 0, y: 6 },
    ],
    heightM: 3,
    floorMaterialId: "concrete_hard",
    ceilingMaterialId: "concrete_hard",
  },
  walls: [],
  portals: [],
  sources: [
    {
      id: "radio",
      name: "Radio",
      clipId: "rain_loop",
      sourceType: "point",
      position: { x: 6, y: 3 },
      gainDb: 0,
      loop: true,
    },
  ],
  listener: { position: { x: 2, y: 3 }, headingDeg: 0 },
  settings: { acousticUpdateHz: 12, maxEarlyReflections: 6, hrtfEnabled: true },
};

describe("computeAcousticFrame", () => {
  it("maps an unobstructed source to a direct frame", () => {
    const frame = computeAcousticFrame(visibleScene, 1234);

    expect(frame).toMatchObject({ revision: 7, generatedAtMs: 1234 });
    expect(frame.sources[0]).toMatchObject({
      sourceId: "radio",
      routeType: "direct",
      directVisible: true,
      physicalDistanceM: 4,
      effectiveDistanceM: 4,
      dryGainDb: 0,
      lowpassHz: 20_000,
      virtualPosition: { x: 6, y: 3 },
      occluderWallIds: [],
      portalIds: [],
      routePolyline: [{ x: 6, y: 3 }, { x: 2, y: 3 }],
      earlyReflections: [],
    });
  });
});
