import { describe, expect, it, vi } from "vitest";

import { compileScene } from "@/ai/scene-compiler";
import {
  ADVERSARIAL_SCENE_PROMPT_FIXTURES,
  CANONICAL_SCENE_PROMPT_FIXTURES,
} from "../fixtures/ai-scene-prompts";

describe("deterministic AI scene prompt evaluation fixtures", () => {
  it.each(CANONICAL_SCENE_PROMPT_FIXTURES)(
    "validates canonical fixture $name directly or after one repair",
    async ({ prompt, firstCandidate, repairedCandidate, expected }) => {
      const generateScene = vi
        .fn()
        .mockResolvedValueOnce(firstCandidate)
        .mockResolvedValue(repairedCandidate ?? firstCandidate);

      const result = await compileScene({ prompt }, { generateScene });

      expect(result.ok).toBe(true);
      expect(generateScene).toHaveBeenCalledTimes(repairedCandidate ? 2 : 1);
      if (!result.ok) {
        return;
      }

      expect(result.scene.room.floorMaterialId).toBe(expected.materialId);
      expect(result.scene.room.ceilingMaterialId).toBe(expected.materialId);
      expect(result.scene.walls.every((wall) => wall.materialId === expected.materialId)).toBe(true);
      expect(result.scene.sources).toHaveLength(expected.sourceCount);
      expect(result.scene.sources[0]?.clipId).toBe(expected.clipId);
      const xs = result.scene.room.outerPolygon.map(({ x }) => x);
      const ys = result.scene.room.outerPolygon.map(({ y }) => y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      const source = result.scene.sources[0];
      expect(source).toBeDefined();
      if (!source) {
        return;
      }
      if (expected.sourceZone === "northwest") {
        expect(source.position.x).toBeLessThan(width / 2);
        expect(source.position.y).toBeLessThan(height / 2);
      } else if (expected.sourceZone === "east") {
        expect(source.position.x).toBeGreaterThan(width / 2);
      } else {
        expect(source.position.x).toBeCloseTo(width / 2);
        expect(source.position.y).toBeCloseTo(height / 2);
      }
      if (expected.geometry === "corridor") {
        expect(width / height).toBeGreaterThanOrEqual(3);
      } else if (expected.geometry === "courtyard") {
        expect(width / height).toBeGreaterThanOrEqual(0.75);
        expect(width / height).toBeLessThanOrEqual(1.33);
      } else if (expected.geometry === "partitioned") {
        expect(result.scene.walls.some((wall) => wall.kind === "partition")).toBe(true);
      } else {
        expect(Math.max(width, height)).toBeLessThanOrEqual(12);
      }
      if (expected.requiresOpenPortal) {
        expect(result.scene.portals.some((portal) => portal.open)).toBe(true);
      }
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
