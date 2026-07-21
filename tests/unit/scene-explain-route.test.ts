import { describe, expect, it, vi } from "vitest";

import { createSlidingWindowLimiter } from "@/ai/rate-limit";
import { handleExplainRequest } from "@/app/api/scene/explain/route";

const validBody = {
  sceneName: "Concrete passage",
  sourceName: "Radio",
  snapshot: {
    routeType: "blocked",
    effectiveDistanceM: 6,
    dryGainDb: -18,
    lowpassHz: 1200,
    portalCount: 0,
    rt60S: { low: 1.8, mid: 1.3, high: 0.7 },
  },
};

const groundedExplanation = {
  summary: "The direct path is blocked in the deterministic snapshot.",
  factors: [{ label: "Direct path", evidence: "The route type is blocked." }],
  limitations: [],
};

describe("POST /api/scene/explain", () => {
  it("requires a user key and marks the response private", async () => {
    const response = await handleExplainRequest(new Request("http://test/api/scene/explain", {
      method: "POST",
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { message: "Add your OpenRouter API key in Settings to explain acoustics." },
    });
  });

  it("returns an unavailable typed error without calling OpenAI", async () => {
    const generateExplanation = vi.fn();
    const response = await handleExplainRequest(
      new Request("http://test/api/scene/explain", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      {
        available: false,
        generateExplanation,
        limiter: createSlidingWindowLimiter(3, 60_000),
        clientKey: () => "test-client",
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "AI_UNAVAILABLE" },
    });
    expect(generateExplanation).not.toHaveBeenCalled();
  });

  it("returns a grounded explanation through the server-only adapter", async () => {
    const response = await handleExplainRequest(
      new Request("http://test/api/scene/explain", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      {
        available: true,
        generateExplanation: vi.fn().mockResolvedValue(groundedExplanation),
        limiter: createSlidingWindowLimiter(3, 60_000),
        clientKey: () => "test-client",
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      explanation: {
        factors: [{ label: "Direct path" }],
        limitations: ["Portal routing is a geometric perceptual approximation."],
      },
    });
  });

  it("rejects a malformed explanation request before the model adapter", async () => {
    const generateExplanation = vi.fn();
    const response = await handleExplainRequest(
      new Request("http://test/api/scene/explain", {
        method: "POST",
        body: JSON.stringify({ ...validBody, sourceName: 42 }),
      }),
      {
        available: true,
        generateExplanation,
        limiter: createSlidingWindowLimiter(3, 60_000),
        clientKey: () => "test-client",
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(generateExplanation).not.toHaveBeenCalled();
  });
});
