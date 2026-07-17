import { describe, expect, it } from "vitest";

import { requestSceneCompilation } from "@/ai/client";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

describe("requestSceneCompilation", () => {
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
});
