import { describe, expect, it } from "vitest";

import { computeAcousticFrame } from "@/acoustics/compute-frame";
import { resolveClassicAcousticPresentation } from "@/components/workspace/ClassicViewportAdapter";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

describe("Classic viewport acoustic presentation", () => {
  it("accepts a complete deterministic fallback frame and keeps its notice truthful", () => {
    const frame = computeAcousticFrame(CONCRETE_PARTITION_PRESET);
    const notice = "Worker unavailable; using deterministic main-thread acoustic updates.";

    expect(resolveClassicAcousticPresentation({
      frame,
      fallbackNotice: notice,
      metrics: { source: "fallback", computeMs: 3 },
    })).toEqual({
      frame,
      worker: "Fallback",
      headerStatus: `Fallback · ${notice}`,
    });
  });
});
