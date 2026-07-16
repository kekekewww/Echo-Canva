import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRESET_ID,
  PRESETS,
  type PresetId,
} from "@/domain/presets";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { HARD_ROOM_PRESET } from "@/domain/presets/hard-room";
import { TREATED_ROOM_PRESET } from "@/domain/presets/treated-room";
import { parseScene, serializeScene } from "@/domain/scene/serialize";
import type { SceneSpec } from "@/domain/scene/types";
import { validateScene } from "@/domain/scene/validate";

describe("scene presets", () => {
  it("exposes exactly three deterministic valid fixtures", () => {
    expect(Object.keys(PRESETS)).toEqual([
      "concrete-partition",
      "hard-room",
      "treated-room",
    ] satisfies PresetId[]);
    expect(DEFAULT_PRESET_ID).toBe("concrete-partition");

    for (const scene of Object.values(PRESETS)) {
      expect(validateScene(scene)).toEqual({ ok: true, scene });
    }
  });

  it("keeps hard and treated comparison rooms geometrically identical", () => {
    expect(TREATED_ROOM_PRESET.room.outerPolygon).toEqual(HARD_ROOM_PRESET.room.outerPolygon);
    expect(TREATED_ROOM_PRESET.room.heightM).toBe(HARD_ROOM_PRESET.room.heightM);
    expect(TREATED_ROOM_PRESET.room.floorMaterialId).not.toBe(
      HARD_ROOM_PRESET.room.floorMaterialId,
    );
    expect(TREATED_ROOM_PRESET.walls.map((wall) => wall.materialId)).not.toEqual(
      HARD_ROOM_PRESET.walls.map((wall) => wall.materialId),
    );
  });

  it("deeply freezes PRESETS and directly exported fixture mutation paths", () => {
    const presetCoordinate = PRESETS["treated-room"].walls[0]!.a.x;
    const directCoordinate = HARD_ROOM_PRESET.sources[0]!.position.x;

    expect(() => {
      PRESETS["treated-room"].walls[0]!.a.x = 999;
    }).toThrow(TypeError);
    expect(() => {
      HARD_ROOM_PRESET.sources[0]!.position.x = 999;
    }).toThrow(TypeError);

    expect(PRESETS["treated-room"].walls[0]!.a.x).toBe(presetCoordinate);
    expect(HARD_ROOM_PRESET.sources[0]!.position.x).toBe(directCoordinate);
    expect(Object.isFrozen(PRESETS["treated-room"].walls[0]!.a)).toBe(true);
    expect(Object.isFrozen(HARD_ROOM_PRESET.sources[0]!.position)).toBe(true);
  });
});

describe("scene serialization", () => {
  it("round-trips a valid scene without mutating or aliasing it", () => {
    const scene = structuredClone(CONCRETE_PARTITION_PRESET);
    const before = structuredClone(scene);

    const serialized = serializeScene(scene);
    const parsed = parseScene(serialized);

    expect(parsed).toEqual(scene);
    expect(parsed).not.toBe(scene);
    expect(scene).toEqual(before);
    expect(JSON.parse(serialized)).toEqual(scene);
  });

  it("atomically rejects invalid JSON and preserves the caller's current scene", () => {
    const currentScene = structuredClone(CONCRETE_PARTITION_PRESET);
    const before = structuredClone(currentScene);

    expect(() => parseScene('{"schemaVersion":')).toThrow(/valid JSON/i);
    expect(currentScene).toEqual(before);
  });

  it("atomically rejects a structurally valid JSON value with invalid domain IDs", () => {
    const candidate = structuredClone(CONCRETE_PARTITION_PRESET);
    candidate.walls[0]!.materialId = "invented_material";
    const before = structuredClone(candidate);

    expect(() => parseScene(JSON.stringify(candidate))).toThrow(/scene validation failed/i);
    expect(candidate).toEqual(before);
  });

  it("rejects unsupported schema versions through the migration shell", () => {
    const legacy = {
      ...structuredClone(CONCRETE_PARTITION_PRESET),
      schemaVersion: "0.9",
    };

    expect(() => parseScene(JSON.stringify(legacy))).toThrow(
      /unsupported scene schema version: 0\.9/i,
    );
  });

  it("refuses to serialize an invalid scene", () => {
    const invalid = structuredClone(CONCRETE_PARTITION_PRESET) as SceneSpec;
    invalid.listener.position = { x: 40, y: 40 };

    expect(() => serializeScene(invalid)).toThrow(/scene validation failed/i);
  });
});
