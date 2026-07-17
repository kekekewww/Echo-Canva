import { describe, expect, it } from "vitest";

import { computeAcousticFrame } from "@/acoustics/compute-frame";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
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

  it("uses portal direction and total route distance only after direct visibility is blocked", () => {
    const openPortalScene = {
      ...CONCRETE_PARTITION_PRESET,
      sources: [
        {
          ...CONCRETE_PARTITION_PRESET.sources[0]!,
          position: { x: 9, y: 1.5 },
        },
      ],
      listener: { ...CONCRETE_PARTITION_PRESET.listener, position: { x: 3, y: 1.5 } },
    };

    const sourceFrame = computeAcousticFrame(openPortalScene).sources[0]!;

    expect(sourceFrame).toMatchObject({
      routeType: "portal",
      directVisible: false,
      portalIds: ["partition_door"],
      virtualPosition: { x: 6, y: 4 },
    });
    expect(sourceFrame.effectiveDistanceM).toBeGreaterThan(sourceFrame.physicalDistanceM);
  });

  it("keeps a direct-visible source direct when its line passes through an open portal", () => {
    const directOpenPortalScene = {
      ...CONCRETE_PARTITION_PRESET,
      sources: [{ ...CONCRETE_PARTITION_PRESET.sources[0]!, position: { x: 9, y: 4 } }],
      listener: { ...CONCRETE_PARTITION_PRESET.listener, position: { x: 3, y: 4 } },
    };

    expect(computeAcousticFrame(directOpenPortalScene).sources[0]).toMatchObject({
      routeType: "direct",
      directVisible: true,
      portalIds: [],
      virtualPosition: { x: 9, y: 4 },
    });
  });

  it("keeps the blocked fallback when no open portal route exists", () => {
    const closedPortalScene = {
      ...CONCRETE_PARTITION_PRESET,
      portals: CONCRETE_PARTITION_PRESET.portals.map((portal) => ({ ...portal, open: false })),
      sources: [{ ...CONCRETE_PARTITION_PRESET.sources[0]!, position: { x: 9, y: 1.5 } }],
      listener: { ...CONCRETE_PARTITION_PRESET.listener, position: { x: 3, y: 1.5 } },
    };

    expect(computeAcousticFrame(closedPortalScene).sources[0]).toMatchObject({
      routeType: "blocked",
      directVisible: false,
      portalIds: [],
      virtualPosition: { x: 9, y: 1.5 },
      occluderWallIds: ["partition_center"],
    });
  });
});
