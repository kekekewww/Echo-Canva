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
