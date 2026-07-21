import { describe, expect, it } from "vitest";

import {
  ACOUSTIC_EPSILON,
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

  it("keeps finite contacts at the source and listener out of direct crossings", () => {
    const closedPortalScene = {
      ...CONCRETE_PARTITION_PRESET,
      portals: CONCRETE_PARTITION_PRESET.portals.map((portal) => ({
        ...portal,
        open: false,
      })),
    };

    const trace = traceDirectPath({ x: 0, y: 4 }, { x: 12, y: 4 }, closedPortalScene);

    expect(trace.crossings.map((crossing) => crossing.wallId)).toEqual(["partition_center"]);
  });

  it("keeps an open portal endpoint blocked while accepting a strictly interior adjacent hit", () => {
    const portalStartY = 3.4;
    const endpointTrace = traceDirectPath(
      { x: 9, y: portalStartY },
      { x: 3, y: portalStartY },
      CONCRETE_PARTITION_PRESET,
    );
    const interiorTrace = traceDirectPath(
      { x: 9, y: portalStartY + ACOUSTIC_EPSILON / 2 },
      { x: 3, y: portalStartY + ACOUSTIC_EPSILON / 2 },
      CONCRETE_PARTITION_PRESET,
    );

    expect(endpointTrace.visible).toBe(false);
    expect(interiorTrace.visible).toBe(true);
  });

  it("does not treat a portal on an unrelated wall as a direct-path gap", () => {
    const sceneWithUnrelatedPortal = {
      ...CONCRETE_PARTITION_PRESET,
      portals: [
        { ...CONCRETE_PARTITION_PRESET.portals[0]!, open: false },
        {
          id: "north_opening",
          wallId: "boundary_north",
          center: { x: 6, y: 0 },
          widthM: 1.2,
          heightM: 2.1,
          open: true,
          lossDb: 3,
        },
      ],
    };

    expect(traceDirectPath(source, listener, sceneWithUnrelatedPortal).visible).toBe(false);
  });

  it("sorts multiple wall crossings by path position and wall ID for equal positions", () => {
    const wall = CONCRETE_PARTITION_PRESET.walls[4]!;
    const walls = [
      { ...wall, id: "z_tie", a: { x: 6, y: 0 }, b: { x: 6, y: 8 } },
      { ...wall, id: "far", a: { x: 8, y: 0 }, b: { x: 8, y: 8 } },
      { ...wall, id: "a_tie", a: { x: 6, y: 0 }, b: { x: 6, y: 8 } },
      { ...wall, id: "near", a: { x: 2, y: 0 }, b: { x: 2, y: 8 } },
    ];

    expect(intersectSegmentWithWalls({ x: 0, y: 4 }, { x: 10, y: 4 }, walls)).toMatchObject([
      { wallId: "near", t: 0.2 },
      { wallId: "a_tie", t: 0.6 },
      { wallId: "z_tie", t: 0.6 },
      { wallId: "far", t: 0.8 },
    ]);
  });

  it("treats a finite collinear interior wall overlap as a direct-path crossing", () => {
    const wall = {
      ...CONCRETE_PARTITION_PRESET.walls[4]!,
      id: "collinear_interior",
      a: { x: 3, y: 0 },
      b: { x: 7, y: 0 },
    };

    expect(intersectSegmentWithWalls(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      [wall],
    )).toMatchObject([{ wallId: "collinear_interior", t: 0.5 }]);
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
