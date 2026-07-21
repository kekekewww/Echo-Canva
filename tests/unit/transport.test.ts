import { describe, expect, it } from "vitest";

import { formatAcousticFrameTiming } from "@/components/workbench/Transport";

describe("transport acoustic timing", () => {
  it("labels measured Worker and fallback compute durations without presenting a timestamp as timing", () => {
    expect(formatAcousticFrameTiming({ revision: 12 }, { source: "worker", computeMs: 3.25 })).toBe(
      "Frame revision 12 · Worker compute 3.3 ms",
    );
    expect(formatAcousticFrameTiming({ revision: 12 }, { source: "fallback", computeMs: 0 })).toBe(
      "Frame revision 12 · Fallback compute 0.0 ms",
    );
  });
});
