import { describe, expect, it } from "vitest";

import { findBestPortalRoute } from "@/acoustics/portal";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

const source = { x: 9, y: 1.5 };
const listener = { x: 3, y: 1.5 };

const openPortalScene = {
  ...CONCRETE_PARTITION_PRESET,
  sources: [{ ...CONCRETE_PARTITION_PRESET.sources[0]!, position: source }],
  listener: { ...CONCRETE_PARTITION_PRESET.listener, position: listener },
};

describe("portal routing", () => {
  it("routes a blocked source through the one visible open portal", () => {
    const route = findBestPortalRoute(source, listener, openPortalScene);

    expect(route?.portalIds).toEqual(["partition_door"]);
    expect(route?.polyline).toEqual([source, { x: 6, y: 4 }, listener]);
    expect(route?.virtualPosition).toEqual({ x: 6, y: 4 });
  });

  it("returns null when that portal is closed", () => {
    const closedPortalScene = {
      ...openPortalScene,
      portals: openPortalScene.portals.map((portal) => ({ ...portal, open: false })),
    };

    expect(findBestPortalRoute(source, listener, closedPortalScene)).toBeNull();
  });

  it("chooses the lowest-cost visible route deterministically when two portals are available", () => {
    const twoPortalScene = {
      ...openPortalScene,
      portals: [
        {
          ...openPortalScene.portals[0]!,
          id: "near_door",
          center: { x: 6, y: 2 },
        },
        {
          ...openPortalScene.portals[0]!,
          id: "far_door",
          center: { x: 6, y: 6 },
        },
      ],
    };

    expect(findBestPortalRoute(source, listener, twoPortalScene)?.portalIds).toEqual([
      "near_door",
    ]);
  });
});
