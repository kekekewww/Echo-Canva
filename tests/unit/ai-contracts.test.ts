import { describe, expect, it } from "vitest";

import { SCENE_COMPILER_MODEL, sceneSpecJsonSchema } from "@/ai/contracts";
import { createSlidingWindowLimiter } from "@/ai/rate-limit";

describe("AI contracts", () => {
  it("declares a strict SceneSpec JSON schema for GPT-5.6 structured output", () => {
    expect(SCENE_COMPILER_MODEL).toBe("gpt-5.6");
    expect(sceneSpecJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: { room: { additionalProperties: false } },
    });
  });

  it("limits a client within a sliding window without storing its key", () => {
    const limiter = createSlidingWindowLimiter(2, 1_000);

    expect(limiter.check("client-123", 100)).toEqual({ allowed: true });
    expect(limiter.check("client-123", 200)).toEqual({ allowed: true });
    expect(limiter.check("client-123", 300)).toEqual({ allowed: false, retryAfterMs: 800 });
    expect(limiter.check("client-123", 1_101)).toEqual({ allowed: true });
  });

  it("bounds tracked clients by evicting the oldest active key", () => {
    const limiter = createSlidingWindowLimiter(1, 1_000, 2);

    expect(limiter.check("first", 100)).toEqual({ allowed: true });
    expect(limiter.check("second", 101)).toEqual({ allowed: true });
    expect(limiter.check("third", 102)).toEqual({ allowed: true });
    expect(limiter.check("first", 103)).toEqual({ allowed: true });
  });

  it("expires keys from the limiter when their entire window has elapsed", () => {
    const limiter = createSlidingWindowLimiter(1, 1_000, 2);

    expect(limiter.check("first", 0)).toEqual({ allowed: true });
    expect(limiter.check("second", 0)).toEqual({ allowed: true });
    expect(limiter.check("third", 1_001)).toEqual({ allowed: true });
    expect(limiter.check("first", 1_001)).toEqual({ allowed: true });
  });
});
