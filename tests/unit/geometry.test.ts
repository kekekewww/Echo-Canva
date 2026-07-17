import { describe, expect, it } from "vitest";

import {
  intersectSegmentWithWalls,
  segmentIntersection,
  traceDirectPath,
} from "@/acoustics/geometry";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

const source = { x: 9, y: 4 };
const listener = { x: 3, y: 4 };

describe("direct-path geometry", () => {
  it("returns the ordered finite intersections for a direct segment", () => {
    const hits = intersectSegmentWithWalls(
      { x: 0, y: 4 },
      { x: 12, y: 4 },
      CONCRETE_PARTITION_PRESET.walls,
    );

    expect(hits.map((hit) => hit.wallId)).toEqual(["partition_center"]);
    expect(hits[0]?.point).toEqual({ x: 6, y: 4 });
  });

  it("treats an open attached portal as a gap but a closed portal as an obstruction", () => {
    const openPortalScene = CONCRETE_PARTITION_PRESET;
    const closedPortalScene = {
      ...CONCRETE_PARTITION_PRESET,
      portals: CONCRETE_PARTITION_PRESET.portals.map((portal) => ({
        ...portal,
        open: false,
      })),
    };

    expect(traceDirectPath(source, listener, openPortalScene).visible).toBe(true);
    expect(traceDirectPath(source, listener, closedPortalScene).visible).toBe(false);
  });

  it("returns a finite hit for endpoint contact and none for parallel, collinear, or zero-length segments", () => {
    expect(
      segmentIntersection(
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 3 },
      ),
    ).toMatchObject({ point: { x: 2, y: 0 }, t: 1, u: 0 });
    expect(
      segmentIntersection(
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 1 },
        { x: 2, y: 1 },
      ),
    ).toBeNull();
    expect(
      segmentIntersection(
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 0 },
        { x: 3, y: 0 },
      ),
    ).toBeNull();
    expect(
      segmentIntersection(
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 },
      ),
    ).toBeNull();
  });
});
