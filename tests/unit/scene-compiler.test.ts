import { describe, expect, it, vi } from "vitest";

import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { compileScene } from "@/ai/scene-compiler";

describe("compileScene", () => {
  it("rejects a 2,001-character prompt before the model adapter", async () => {
    const generateScene = vi.fn();

    const result = await compileScene({ prompt: "x".repeat(2001) }, { generateScene });

    expect(result).toMatchObject({ ok: false, error: { code: "PROMPT_TOO_LONG" } });
    expect(generateScene).not.toHaveBeenCalled();
  });

  it("repairs an invalid candidate exactly once then returns a validated scene", async () => {
    const invalidScene = { ...CONCRETE_PARTITION_PRESET, name: "" };
    const validScene = structuredClone(CONCRETE_PARTITION_PRESET);
    const generateScene = vi
      .fn()
      .mockResolvedValueOnce(invalidScene)
      .mockResolvedValueOnce(validScene);

    await expect(compileScene({ prompt: "small treated room" }, { generateScene })).resolves.toMatchObject({
      ok: true,
      repairAttempted: true,
      scene: validScene,
    });
    expect(generateScene).toHaveBeenCalledTimes(2);
  });
});
