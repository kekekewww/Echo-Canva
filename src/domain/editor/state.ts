import { DEFAULT_PRESET_ID, PRESETS } from "@/domain/presets";
import type { SceneSpec } from "@/domain/scene/types";

export type EditorSelection =
  | { type: "listener" }
  | { type: "source" | "wall" | "portal"; id: string }
  | null;

export type PreviewMode = "raw" | "simulated";
export type AudioStatus = "idle" | "ready";
export type EditorNotice = Readonly<{
  kind: "rejection";
  message: string;
}>;

export type EditorState = Readonly<{
  scene: SceneSpec;
  selectedObject: EditorSelection;
  mode: PreviewMode;
  audioStatus: AudioStatus;
  editNotice: EditorNotice | null;
}>;

function initialSelection(scene: SceneSpec): EditorSelection {
  const source = scene.sources[0];
  return source ? { type: "source", id: source.id } : { type: "listener" };
}

export function createEditorState(
  scene: SceneSpec = PRESETS[DEFAULT_PRESET_ID],
): EditorState {
  const sceneCopy = structuredClone(scene);

  return {
    scene: sceneCopy,
    selectedObject: initialSelection(sceneCopy),
    mode: "raw",
    audioStatus: "idle",
    editNotice: null,
  };
}

export function selectionForScene(scene: SceneSpec): EditorSelection {
  return initialSelection(scene);
}
