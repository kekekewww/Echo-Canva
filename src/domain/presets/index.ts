import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { HARD_ROOM_PRESET } from "@/domain/presets/hard-room";
import { TREATED_ROOM_PRESET } from "@/domain/presets/treated-room";
import type { SceneSpec } from "@/domain/scene/types";

export type PresetId = "concrete-partition" | "hard-room" | "treated-room";

export const PRESETS: Readonly<Record<PresetId, SceneSpec>> = Object.freeze({
  "concrete-partition": CONCRETE_PARTITION_PRESET,
  "hard-room": HARD_ROOM_PRESET,
  "treated-room": TREATED_ROOM_PRESET,
});

export const DEFAULT_PRESET_ID: PresetId = "concrete-partition";

export {
  CONCRETE_PARTITION_PRESET,
  HARD_ROOM_PRESET,
  TREATED_ROOM_PRESET,
};
