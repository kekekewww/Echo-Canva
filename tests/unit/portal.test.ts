import { describe, expect, it } from "vitest";

import { findBestPortalRoute, portalLowpassHz } from "@/acoustics/portal";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

const source = { x: 9, y: 1.5 };
const listener = { x: 3, y: 1.5 };

const openPortalScene = {
  ...CONCRETE_PARTITION_PRESET,
  sources: [{ ...CONCRETE_PARTITION_PRESET.sources[0]!, position: source }],
  listener: { ...CONCRETE_PARTITION_PRESET.listener, position: listener },
};

const serialPortalScene = {
  ...openPortalScene,
  walls: [
    {
      ...CONCRETE_PARTITION_PRESET.walls[4]!,
      id: "first_partition",
      a: { x: 7, y: 0 },
      b: { x: 7, y: 8 },
    },
    {
      ...CONCRETE_PARTITION_PRESET.walls[4]!,
      id: "second_partition",
      a: { x: 5, y: 0 },
      b: { x: 5, y: 8 },
    },
  ],
  portals: [
    {
      ...CONCRETE_PARTITION_PRESET.portals[0]!,
      id: "first_door",
      wallId: "first_partition",
      center: { x: 7, y: 4 },
      lossDb: 3,
    },
    {
      ...CONCRETE_PARTITION_PRESET.portals[0]!,
      id: "second_door",
      wallId: "second_partition",
      center: { x: 5, y: 4 },
      lossDb: 4,
    },
  ],
  sources: [{ ...CONCRETE_PARTITION_PRESET.sources[0]!, position: { x: 9, y: 4 } }],
  listener: { ...CONCRETE_PARTITION_PRESET.listener, position: { x: 1, y: 4 } },
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

  it("breaks exact equal-cost route ties by lexical portal-ID sequence", () => {
    const tiedPortalScene = {
      ...openPortalScene,
      sources: [{ ...openPortalScene.sources[0]!, position: { x: 9, y: 4 } }],
      listener: { ...openPortalScene.listener, position: { x: 3, y: 4 } },
      portals: [
        { ...openPortalScene.portals[0]!, id: "beta_door", center: { x: 6, y: 3 } },
        { ...openPortalScene.portals[0]!, id: "alpha_door", center: { x: 6, y: 5 } },
      ],
    };

    expect(findBestPortalRoute({ x: 9, y: 4 }, { x: 3, y: 4 }, tiedPortalScene)?.portalIds).toEqual([
      "alpha_door",
    ]);
  });

  it("represents an intermediate open portal as a route node instead of waiving it", () => {
    const route = findBestPortalRoute(
      serialPortalScene.sources[0]!.position,
      serialPortalScene.listener.position,
      serialPortalScene,
    );

    expect(route?.portalIds).toEqual(["first_door", "second_door"]);
  });

  it("waives only the selected portal host wall when another closed wall shares the endpoint", () => {
    const sceneWithCoincidentClosedWall = {
      ...openPortalScene,
      walls: [
        ...openPortalScene.walls,
        { ...openPortalScene.walls[4]!, id: "closed_coincident_partition" },
      ],
    };

    expect(findBestPortalRoute(source, listener, sceneWithCoincidentClosedWall)).toBeNull();
  });

  it("blocks a listener-only wall endpoint instead of treating it as a portal gap", () => {
    const listenerOnBoundaryScene = {
      ...openPortalScene,
      listener: { ...openPortalScene.listener, position: { x: 0, y: 4 } },
    };

    expect(findBestPortalRoute(source, { x: 0, y: 4 }, listenerOnBoundaryScene)).toBeNull();
  });

  it("uses the listener-facing final portal rather than the Euclidean-nearest portal", () => {
    const listenerFacingRouteScene = {
      ...serialPortalScene,
      listener: { ...serialPortalScene.listener, position: { x: 1, y: 1 } },
      portals: [
        serialPortalScene.portals[0]!,
        { ...serialPortalScene.portals[1]!, center: { x: 5, y: 7 } },
      ],
    };
    const route = findBestPortalRoute(
      listenerFacingRouteScene.sources[0]!.position,
      listenerFacingRouteScene.listener.position,
      listenerFacingRouteScene,
    );

    expect(route).toMatchObject({
      portalIds: ["first_door", "second_door"],
      dryGainDb: -7,
      lowpassHz: 17_000,
      virtualPosition: { x: 5, y: 7 },
    });
    expect(portalLowpassHz(20)).toBe(1_200);
  });
});
