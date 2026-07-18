import { describe, expect, it } from "vitest";

import { CLASSIC_BASELINE_SCENARIO_COUNT, captureClassicBaseline } from "@/benchmarks/classic-baseline";
import baselineArtifact from "../../benchmarks/results/mvp-baseline.json";

describe("Classic 2.5D baseline capture", () => {
  it("matches the immutable ten-scenario Classic regression oracle", () => {
    const capture = captureClassicBaseline();

    expect(capture).toHaveLength(CLASSIC_BASELINE_SCENARIO_COUNT);
    expect(baselineArtifact.engine).toBe("classic-2d5d");
    expect(baselineArtifact.scenarioCount).toBe(CLASSIC_BASELINE_SCENARIO_COUNT);
    expect(capture).toEqual(baselineArtifact.scenarios);
  });
});
