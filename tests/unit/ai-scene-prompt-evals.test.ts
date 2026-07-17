import { describe, expect, it, vi } from "vitest";

import { compileScene } from "@/ai/scene-compiler";
import {
  ADVERSARIAL_SCENE_PROMPT_FIXTURES,
  CANONICAL_SCENE_PROMPT_FIXTURES,
} from "../fixtures/ai-scene-prompts";

describe("deterministic AI scene prompt evaluation fixtures", () => {
  it.each(CANONICAL_SCENE_PROMPT_FIXTURES)(
    "validates canonical fixture $name directly or after one repair",
    async ({ prompt, firstCandidate, repairedCandidate }) => {
      const generateScene = vi
        .fn()
        .mockResolvedValueOnce(firstCandidate)
        .mockResolvedValue(repairedCandidate ?? firstCandidate);

      const result = await compileScene({ prompt }, { generateScene });

      expect(result.ok).toBe(true);
      expect(generateScene).toHaveBeenCalledTimes(repairedCandidate ? 2 : 1);
    },
  );

  it.each(ADVERSARIAL_SCENE_PROMPT_FIXTURES)(
    "keeps adversarial fixture $name out of validated candidate state",
    async ({ prompt, invalidCandidate }) => {
      const result = await compileScene(
        { prompt },
        { generateScene: vi.fn().mockResolvedValue(invalidCandidate) },
      );

      expect(result).toMatchObject({ ok: false, error: { code: "SCENE_VALIDATION_FAILED" } });
    },
  );
});
