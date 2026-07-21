import { describe, expect, it } from "vitest";

import { traceDirectPath } from "@/acoustics/geometry";
import { estimateDirectOcclusion } from "@/acoustics/occlusion";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

const source = { x: 9, y: 4 };
const listener = { x: 3, y: 4 };

describe("direct occlusion", () => {
  it("keeps a visible source at 0 dB occlusion and 20000 Hz", () => {
    expect(
      estimateDirectOcclusion({ visible: true, crossings: [], polyline: [source, listener] }),
    ).toMatchObject({ dryGainDb: 0, lowpassHz: 20_000, occluderWallIds: [] });
  });

  it("caps concrete direct loss and lowers the high-frequency cutoff", () => {
    const traceWithConcreteCrossing = traceDirectPath(source, listener, {
      ...CONCRETE_PARTITION_PRESET,
      portals: CONCRETE_PARTITION_PRESET.portals.map((portal) => ({ ...portal, open: false })),
    });

    const estimate = estimateDirectOcclusion(traceWithConcreteCrossing);

    expect(estimate.dryGainDb).toBe(-24);
    expect(estimate.lowpassHz).toBeLessThan(2_000);
    expect(estimate.occluderWallIds).toEqual(["partition_center"]);
    expect(estimate.transmissionLossDb).toEqual({ low: 28, mid: 34, high: 40 });
  });

  it("floors thin-wall transmission loss so a valid material never adds direct gain", () => {
    const partition = CONCRETE_PARTITION_PRESET.walls[4]!;
    const thinFoliageScene = {
      ...CONCRETE_PARTITION_PRESET,
      walls: [
        {
          ...partition,
          materialId: "soft_foliage",
          thicknessM: 0.02,
        },
      ],
      portals: [],
    };

    const estimate = estimateDirectOcclusion(traceDirectPath(source, listener, thinFoliageScene));

    expect(estimate).toMatchObject({
      dryGainDb: 0,
      lowpassHz: 20_000,
      transmissionLossDb: { low: 0, mid: 0, high: 0 },
    });
  });

  it("accumulates uncapped three-band loss across multiple walls", () => {
    const partition = CONCRETE_PARTITION_PRESET.walls[4]!;
    const twoWallScene = {
      ...CONCRETE_PARTITION_PRESET,
      walls: [
        {
          ...partition,
          id: "wood_wall",
          a: { x: 4, y: 0 },
          b: { x: 4, y: 8 },
          materialId: "wood_medium",
          thicknessM: 0.12,
        },
        {
          ...partition,
          id: "foliage_wall",
          a: { x: 6, y: 0 },
          b: { x: 6, y: 8 },
          materialId: "soft_foliage",
          thicknessM: 0.4,
        },
      ],
      portals: [],
    };

    const estimate = estimateDirectOcclusion(traceDirectPath(source, listener, twoWallScene));

    expect(estimate).toMatchObject({
      dryGainDb: -24,
      occluderWallIds: ["foliage_wall", "wood_wall"],
      transmissionLossDb: { low: 26, mid: 32, high: 38 },
    });
  });

  it("applies the oblique-incidence thickness adjustment to all three bands", () => {
    const partition = CONCRETE_PARTITION_PRESET.walls[4]!;
    const obliqueScene = {
      ...CONCRETE_PARTITION_PRESET,
      walls: [{ ...partition }],
      portals: [],
    };
    const obliqueTrace = traceDirectPath({ x: 9, y: 6 }, { x: 1, y: 2 }, obliqueScene);
    const estimate = estimateDirectOcclusion(obliqueTrace);
    const adjustment = 6 * Math.log2(Math.sqrt(5) / 2);

    expect(estimate.transmissionLossDb.low).toBeCloseTo(28 + adjustment, 10);
    expect(estimate.transmissionLossDb.mid).toBeCloseTo(34 + adjustment, 10);
    expect(estimate.transmissionLossDb.high).toBeCloseTo(40 + adjustment, 10);
  });
});
