import { describe, expect, it } from "vitest";

import { requestSceneCompilation } from "@/ai/client";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

describe("requestSceneCompilation", () => {
  it("requests and preserves a mode-aware Hybrid 3D candidate", async () => {
    const scene = structuredClone(CONCRETE_PARTITION_PRESET);
    scene.room.outerPolygon = [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 10 }, { x: 0, y: 10 }];
    scene.room.heightM = 4.5;
    const spatial3d = {
      listenerHeightM: 1.7,
      sourceHeights: scene.sources.map(({ id }, index) => ({ sourceId: id, heightM: index === 0 ? 1.4 : 3.2 })),
      wallVerticalBounds: scene.walls.map(({ id }) => ({ wallId: id, bottomM: 0, topM: 4.5 })),
      portalVerticalBounds: scene.portals.map(({ id }) => ({ portalId: id, bottomM: 0, topM: 2.1, thicknessM: 0.2 })),
      primitives: [{
        id: "ai_box",
        name: "AI Box",
        kind: "box" as const,
        position: { x: 7, y: 0.5, z: 5 },
        dimensions: { x: 1, y: 1, z: 1 },
        rotationYDeg: 0,
        materialId: "wood_medium",
      }],
    };
    let requestBody: unknown;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as unknown;
      return new Response(JSON.stringify({
        ok: true,
        scene,
        spatial3d,
        model: "openai/gpt-5.6-luna",
        repairAttempted: false,
        warnings: [],
      }));
    };

    const response = await requestSceneCompilation(
      "a 3D gallery",
      CONCRETE_PARTITION_PRESET,
      "hybrid-3d",
      fetcher,
    );

    expect(requestBody).toMatchObject({ targetMode: "hybrid-3d" });
    expect(response).toMatchObject({ ok: true, spatial3d });
  });

  it.each([
    ["AI_REQUEST_FAILED", "The scene generator is temporarily unavailable."],
    ["AI_UNAVAILABLE", "AI scene generation is unavailable. Load a preset instead."],
    ["AI_TIMEOUT", "The scene generator timed out. Try again."],
    ["AI_REFUSED", "The scene generator could not complete that request."],
    ["INVALID_BASE_SCENE", "Base scene must be a valid SceneSpec."],
    ["INVALID_JSON", "Request body must be valid JSON."],
    ["INVALID_REQUEST", "Prompt must be a string."],
    ["PROMPT_TOO_LONG", "Describe the scene in 2,000 characters or fewer."],
    ["RATE_LIMITED", "Too many scene compile requests. Try again shortly."],
    ["SCENE_VALIDATION_FAILED", "The generated scene could not be validated."],
  ] as const)("preserves the actionable %s server failure and fallback", async (code, message) => {
    const response = await requestSceneCompilation(
      "A room",
      CONCRETE_PARTITION_PRESET,
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: { code, message },
            fallbackSceneId: "concrete-partition",
            ...(code === "RATE_LIMITED" ? { retryAfterMs: 5000 } : {}),
          }),
          { status: code === "AI_UNAVAILABLE" ? 503 : code === "AI_TIMEOUT" ? 504 : 429 },
        ),
    );

    expect(response).toMatchObject({
      ok: false,
      error: { code, message },
      fallbackSceneId: "concrete-partition",
    });
    if (code === "RATE_LIMITED") {
      expect(response).toMatchObject({ retryAfterMs: 5000 });
    }
  });

  it("returns a typed compiler fallback without throwing", async () => {
    const response = await requestSceneCompilation(
      "A room",
      CONCRETE_PARTITION_PRESET,
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "SCENE_VALIDATION_FAILED",
              message: "The generated scene could not be validated.",
            },
            fallbackSceneId: "concrete-partition",
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    );

    expect(response).toMatchObject({
      ok: false,
      fallbackSceneId: "concrete-partition",
    });
  });

  it("accepts the fixed OpenRouter Luna model metadata", async () => {
    const response = await requestSceneCompilation(
      "A room",
      CONCRETE_PARTITION_PRESET,
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            scene: CONCRETE_PARTITION_PRESET,
            model: "openai/gpt-5.6-luna",
            repairAttempted: false,
            warnings: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    expect(response).toMatchObject({ ok: true, model: "openai/gpt-5.6-luna" });
  });

  it("converts malformed server data into a typed failure", async () => {
    const response = await requestSceneCompilation(
      "A room",
      CONCRETE_PARTITION_PRESET,
      async () => new Response("not json", { status: 502 }),
    );

    expect(response).toEqual({
      ok: false,
      error: {
        code: "SCENE_VALIDATION_FAILED",
        message: "The scene generator returned an invalid response. Keep editing manually or load a preset.",
      },
      fallbackSceneId: "concrete-partition",
    });
  });

  it.each(["toString", "__proto__"])("rejects inherited fallback preset ID %s", async (fallbackSceneId) => {
    const response = await requestSceneCompilation(
      "A room",
      CONCRETE_PARTITION_PRESET,
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "SCENE_VALIDATION_FAILED",
              message: "The generated scene could not be validated.",
            },
            fallbackSceneId,
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    );

    expect(response).toMatchObject({
      ok: false,
      fallbackSceneId: "concrete-partition",
      error: { code: "SCENE_VALIDATION_FAILED" },
    });
  });
});
