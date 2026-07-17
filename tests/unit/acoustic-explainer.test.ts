import { describe, expect, it, vi } from "vitest";

import { explainAcoustics } from "@/ai/acoustic-explainer";

const validRequest = {
  sceneName: "Concrete passage",
  sourceName: "Radio",
  snapshot: {
    routeType: "portal" as const,
    effectiveDistanceM: 9.2,
    dryGainDb: -13.4,
    lowpassHz: 1800,
    portalCount: 1,
    rt60S: { low: 1.8, mid: 1.3, high: 0.7 },
  },
};

const groundedExplanation = {
  summary: "The portal route uses the projected deterministic values.",
  factors: [{ label: "Route", evidence: "The route type is portal." }],
  limitations: ["The response summarizes a deterministic snapshot."],
};

describe("explainAcoustics", () => {
  it("rejects an explanation that introduces an absent numeric measurement", async () => {
    const inventedMeasurement = {
      ...groundedExplanation,
      factors: [{ label: "Direct loss", evidence: "The direct loss is -22 dB." }],
    };

    const result = await explainAcoustics(validRequest, {
      generateExplanation: async () => inventedMeasurement,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "EXPLANATION_VALIDATION_FAILED" } });
  });

  it("uses the deterministic route, gain, filter, and RT60 snapshot in the prompt", async () => {
    const generateExplanation = vi.fn().mockResolvedValue(groundedExplanation);

    await expect(explainAcoustics(validRequest, { generateExplanation })).resolves.toMatchObject({
      ok: true,
    });

    expect(generateExplanation).toHaveBeenCalledWith(expect.stringContaining("-13.4"));
    expect(generateExplanation).toHaveBeenCalledWith(expect.stringContaining("1800"));
    expect(generateExplanation).toHaveBeenCalledWith(expect.stringContaining("1.3"));
  });

  it("rejects a non-finite deterministic snapshot before the model adapter", async () => {
    const generateExplanation = vi.fn();

    const result = await explainAcoustics(
      { ...validRequest, snapshot: { ...validRequest.snapshot, lowpassHz: Number.NaN } },
      { generateExplanation },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "EXPLANATION_VALIDATION_FAILED" } });
    expect(generateExplanation).not.toHaveBeenCalled();
  });

  it("appends the fixed portal-routing limitation instead of trusting model limitation copy", async () => {
    const result = await explainAcoustics(validRequest, {
      generateExplanation: async () => groundedExplanation,
    });

    expect(result).toMatchObject({
      ok: true,
      explanation: {
        limitations: expect.arrayContaining([
          "Portal routing is a geometric perceptual approximation.",
        ]),
      },
    });
  });

  it.each([
    "The cutoff is 20Hz.",
    "The cutoff is 2e3 Hz.",
    "The cutoff is twenty hertz.",
    "The cutoff is a dozen hertz.",
    "The cutoff is half the usual value.",
    "I heard the source behind the wall.",
    "The source is audible behind the wall.",
    "You will perceive the portal route.",
    "The result sounds realistic.",
    "The result is lifelike.",
    "This is an accurate acoustic result.",
    "This has architectural accuracy.",
  ])("rejects a grounding bypass: %s", async (evidence) => {
    const result = await explainAcoustics(validRequest, {
      generateExplanation: async () => ({
        ...groundedExplanation,
        factors: [{ label: "Untrusted claim", evidence }],
      }),
    });

    expect(result).toMatchObject({ ok: false, error: { code: "EXPLANATION_VALIDATION_FAILED" } });
  });

  it("retains exact projected values when they use separated display units", async () => {
    const result = await explainAcoustics(validRequest, {
      generateExplanation: async () => ({
        ...groundedExplanation,
        factors: [
          {
            label: "Projected evidence",
            evidence: "The portal route uses 9.2 m, -13.4 dB, and 1800 Hz.",
          },
        ],
      }),
    });

    expect(result).toMatchObject({ ok: true });
  });
});
