import { describe, expect, it } from "vitest";

import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { validateScene } from "@/domain/scene/validate";
import type { SceneSpec, SceneValidationResult } from "@/domain/scene/types";

function cloneFixture(): SceneSpec {
  return structuredClone(CONCRETE_PARTITION_PRESET);
}

function expectIssue(
  result: SceneValidationResult,
  code: string,
  path?: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(
      result.errors.some(
        (error) => error.code === code && (path === undefined || error.path === path),
      ),
    ).toBe(true);
  }
}

describe("validateScene", () => {
  it("accepts a valid deterministic fixture without mutating it", () => {
    const input = cloneFixture();
    const before = structuredClone(input);

    const result = validateScene(input);

    expect(result).toEqual({ ok: true, scene: input });
    expect(input).toEqual(before);
    if (result.ok) {
      expect(result.scene).not.toBe(input);
    }
  });

  it("rejects unknown material registry IDs", () => {
    const input = cloneFixture();
    input.room.floorMaterialId = "invented_floor";
    input.walls[0]!.materialId = "invented_wall";

    const result = validateScene(input);

    expectIssue(result, "unknown_material_id", "room.floorMaterialId");
    expectIssue(result, "unknown_material_id", "walls.0.materialId");
  });

  it("rejects a well-formed but unknown audio registry ID", () => {
    const input = cloneFixture();
    input.sources[0]!.clipId = "invented_clip";

    expectIssue(validateScene(input), "unknown_audio_asset_id", "sources.0.clipId");
  });

  it("structurally rejects arbitrary remote audio URLs", () => {
    const input = cloneFixture();
    input.sources[0]!.clipId = "https://example.com/remote.mp3";

    expectIssue(validateScene(input), "invalid_format", "sources.0.clipId");
  });

  it("rejects duplicate entity IDs across walls, portals, and sources", () => {
    const input = cloneFixture();
    input.sources[0]!.id = input.walls[0]!.id;

    expectIssue(validateScene(input), "duplicate_id", "sources.0.id");
  });

  it.each([
    ["zero-length", 0],
    ["sub-minimum", 0.09],
  ] as const)("rejects a %s wall", (_label, lengthM) => {
    const input = cloneFixture();
    input.walls[0]!.b = {
      x: input.walls[0]!.a.x + lengthM,
      y: input.walls[0]!.a.y,
    };

    expectIssue(validateScene(input), "wall_too_short", "walls.0");
  });

  it("rejects a self-intersecting outer polygon", () => {
    const input = cloneFixture();
    input.room.outerPolygon = [
      { x: 0, y: 0 },
      { x: 8, y: 8 },
      { x: 0, y: 8 },
      { x: 8, y: 0 },
    ];

    expectIssue(validateScene(input), "polygon_self_intersection", "room.outerPolygon");
  });

  it("rejects a portal detached from its referenced wall", () => {
    const input = cloneFixture();
    input.portals[0]!.center = { x: 5, y: 4 };

    expectIssue(validateScene(input), "portal_detached", "portals.0.center");
  });

  it("rejects non-finite coordinates", () => {
    const input = cloneFixture();
    input.listener.position.x = Number.NaN;

    expectIssue(validateScene(input), "invalid_type", "listener.position.x");
  });

  it.each([
    ["walls", 101],
    ["portals", 9],
    ["sources", 5],
  ] as const)("rejects %s above its hard count limit", (collection, count) => {
    const input = cloneFixture();

    if (collection === "walls") {
      input.walls = Array.from({ length: count }, (_, index) => ({
        ...structuredClone(input.walls[0]!),
        id: `wall_${index}`,
      }));
    } else if (collection === "portals") {
      input.portals = Array.from({ length: count }, (_, index) => ({
        ...structuredClone(input.portals[0]!),
        id: `portal_${index}`,
      }));
    } else {
      input.sources = Array.from({ length: count }, (_, index) => ({
        ...structuredClone(input.sources[0]!),
        id: `source_${index}`,
      }));
    }

    expectIssue(validateScene(input), "too_big", collection);
  });

  it("rejects room extents above 50 metres", () => {
    const input = cloneFixture();
    input.room.outerPolygon = [
      { x: -25.1, y: 0 },
      { x: 25.1, y: 0 },
      { x: 25.1, y: 8 },
      { x: -25.1, y: 8 },
    ];

    expectIssue(validateScene(input), "room_dimension_exceeded", "room.outerPolygon");
  });

  it("rejects listener and sources outside the room polygon", () => {
    const input = cloneFixture();
    input.listener.position = { x: -1, y: 4 };
    input.sources[0]!.position = { x: 13, y: 4 };

    const result = validateScene(input);

    expectIssue(result, "position_out_of_bounds", "listener.position");
    expectIssue(result, "position_out_of_bounds", "sources.0.position");
  });
});
