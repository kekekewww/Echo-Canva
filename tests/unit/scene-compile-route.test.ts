import { describe, expect, it, vi } from "vitest";

import { createSlidingWindowLimiter } from "@/ai/rate-limit";
import { handleCompileRequest } from "@/app/api/scene/compile/route";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

const unavailableDependencies = {
  available: false,
  generateScene: vi.fn(),
  limiter: createSlidingWindowLimiter(3, 60_000),
  clientKey: () => "test-client",
};

describe("POST /api/scene/compile", () => {
  it("requires a user key even when deployment credentials exist", async () => {
    const previousProvider = process.env.AI_PROVIDER;
    const previousKey = process.env.OPENROUTER_API_KEY;
    process.env.AI_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "sk-or-v1-owner-key-1234567890";
    try {
      const response = await handleCompileRequest(new Request("http://test/api/scene/compile", {
        method: "POST",
        body: JSON.stringify({ prompt: "room" }),
      }));

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: { message: "Add your OpenRouter API key in Settings to generate a scene." },
      });
    } finally {
      if (previousProvider === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = previousProvider;
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
    }
  });

  it("returns an unavailable fallback without OPENAI_API_KEY", async () => {
    const response = await handleCompileRequest(
      new Request("http://test/api/scene/compile", {
        method: "POST",
        body: JSON.stringify({ prompt: "room" }),
      }),
      unavailableDependencies,
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "AI_UNAVAILABLE" },
      fallbackSceneId: "concrete-partition",
    });
  });

  it("rejects malformed JSON before calling the model", async () => {
    const generateScene = vi.fn();
    const response = await handleCompileRequest(
      new Request("http://test/api/scene/compile", { method: "POST", body: "{" }),
      {
        available: true,
        generateScene,
        limiter: createSlidingWindowLimiter(3, 60_000),
        clientKey: () => "test-client",
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_JSON" },
    });
    expect(generateScene).not.toHaveBeenCalled();
  });

  it("rejects a non-string prompt", async () => {
    const response = await handleCompileRequest(
      new Request("http://test/api/scene/compile", {
        method: "POST",
        body: JSON.stringify({ prompt: 42 }),
      }),
      { ...unavailableDependencies, available: true },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("rejects an invalid base scene before calling the model", async () => {
    const generateScene = vi.fn();
    const response = await handleCompileRequest(
      new Request("http://test/api/scene/compile", {
        method: "POST",
        body: JSON.stringify({ baseScene: { name: "invalid" }, prompt: "room" }),
      }),
      {
        available: true,
        generateScene,
        limiter: createSlidingWindowLimiter(3, 60_000),
        clientKey: () => "test-client",
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_BASE_SCENE" },
    });
    expect(generateScene).not.toHaveBeenCalled();
  });

  it("rejects a null base scene before calling the model", async () => {
    const generateScene = vi.fn();
    const response = await handleCompileRequest(
      new Request("http://test/api/scene/compile", {
        method: "POST",
        body: JSON.stringify({ baseScene: null, prompt: "room" }),
      }),
      {
        available: true,
        generateScene,
        limiter: createSlidingWindowLimiter(3, 60_000),
        clientKey: () => "test-client",
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_BASE_SCENE" },
    });
    expect(generateScene).not.toHaveBeenCalled();
  });

  it("returns a typed timeout response when the adapter times out", async () => {
    const timeout = new Error("request timed out");
    timeout.name = "AbortError";
    const response = await handleCompileRequest(
      new Request("http://test/api/scene/compile", {
        method: "POST",
        body: JSON.stringify({ prompt: "room" }),
      }),
      {
        available: true,
        generateScene: vi.fn().mockRejectedValue(timeout),
        limiter: createSlidingWindowLimiter(3, 60_000),
        clientKey: () => "test-client",
      },
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "AI_TIMEOUT" },
      fallbackSceneId: "concrete-partition",
    });
  });

  it("returns a typed refusal response when the model refuses", async () => {
    const refusal = new Error("refused");
    refusal.name = "ModelRefusalError";
    const response = await handleCompileRequest(
      new Request("http://test/api/scene/compile", {
        method: "POST",
        body: JSON.stringify({ prompt: "room" }),
      }),
      {
        available: true,
        generateScene: vi.fn().mockRejectedValue(refusal),
        limiter: createSlidingWindowLimiter(3, 60_000),
        clientKey: () => "test-client",
      },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "AI_REFUSED" },
      fallbackSceneId: "concrete-partition",
    });
  });

  it("rate limits repeat requests using only the derived client key", async () => {
    const limiter = createSlidingWindowLimiter(1, 60_000);
    const dependencies = {
      available: true,
      generateScene: vi.fn().mockResolvedValue(CONCRETE_PARTITION_PRESET),
      limiter,
      clientKey: () => "derived-client-key",
    };
    const request = () =>
      new Request("http://test/api/scene/compile", {
        method: "POST",
        body: JSON.stringify({ prompt: "room" }),
      });

    expect((await handleCompileRequest(request(), dependencies)).status).toBe(200);
    const limited = await handleCompileRequest(request(), dependencies);

    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
  });
});
