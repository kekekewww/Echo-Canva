import { describe, expect, it } from "vitest";

import { portalForRouteMarker } from "@/components/workbench/SceneEditor";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

describe("portal route overlay", () => {
  it("marks the listener-facing final portal from a multi-portal route", () => {
    const portals = [
      { ...CONCRETE_PARTITION_PRESET.portals[0]!, id: "first_door", center: { x: 7, y: 4 } },
      { ...CONCRETE_PARTITION_PRESET.portals[0]!, id: "second_door", center: { x: 5, y: 7 } },
    ];

    expect(portalForRouteMarker(portals, ["first_door", "second_door"])?.id).toBe("second_door");
  });
});
