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
});
