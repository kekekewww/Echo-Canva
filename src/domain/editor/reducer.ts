import { PRESETS, type PresetId } from "@/domain/presets";
import type { SceneSpec } from "@/domain/scene/types";
import type { SceneValidationIssue } from "@/domain/scene/types";
import { validateScene } from "@/domain/scene/validate";
import {
  selectionForScene,
  type AudioStatus,
  type EditorSelection,
  type EditorState,
  type PreviewMode,
} from "@/domain/editor/state";

type Wall = SceneSpec["walls"][number];

function rejectionMessage(errors: readonly SceneValidationIssue[]): string {
  if (errors.some(({ code, path }) => code === "too_big" && path === "walls")) {
    return "Wall limit reached (100). Delete a wall before adding another.";
  }
  if (errors.some(({ code }) => code === "unknown_material_id")) {
    return "Material change rejected. Choose a built-in material preset.";
  }
  if (errors.some(({ code }) => code === "wall_too_short")) {
    return "Wall edit rejected. Walls must be at least 0.10 m long.";
  }
  if (errors.some(({ code }) => code === "portal_detached")) {
    return "Wall edit rejected. Its hosted portal would become detached or no longer fit; keep the portal on the wall.";
  }
  if (
    errors.some(({ code, path }) =>
      code === "position_out_of_bounds" ||
      ((code === "too_big" || code === "too_small") &&
        (path.startsWith("sources.") || path.startsWith("listener.position"))),
    )
  ) {
    return "Move rejected. Keep sources and the listener inside the room.";
  }
  return `Edit rejected. ${errors[0]?.message ?? "Keep the scene within its documented limits."}`;
}

function rejectEdit(state: EditorState, message: string): EditorState {
  return { ...state, editNotice: { kind: "rejection", message } };
}

export type EditorAction =
  | { type: "LOAD_PRESET"; presetId: PresetId }
  | { type: "SELECT_OBJECT"; selection: EditorSelection }
  | { type: "MOVE_LISTENER"; position: SceneSpec["listener"]["position"] }
  | { type: "MOVE_SOURCE"; sourceId: string; position: SceneSpec["listener"]["position"] }
  | { type: "ADD_WALL"; wall: Wall }
  | {
      type: "MOVE_WALL_ENDPOINT";
      wallId: string;
      endpoint: "a" | "b";
      position: SceneSpec["listener"]["position"];
    }
  | { type: "DELETE_WALL"; wallId: string }
  | { type: "SET_WALL_MATERIAL"; wallId: string; materialId: string }
  | { type: "TOGGLE_PORTAL"; portalId: string }
  | { type: "SET_MODE"; mode: PreviewMode }
  | { type: "SET_AUDIO_STATUS"; status: AudioStatus };

function commitScene(
  state: EditorState,
  mutate: (draft: SceneSpec) => boolean | void,
): EditorState {
  const draft = structuredClone(state.scene);
  const didMutate = mutate(draft);
  if (didMutate === false) {
    return rejectEdit(
      state,
      "Edit rejected. The selected object no longer exists; select it again.",
    );
  }

  draft.revision = state.scene.revision + 1;
  const validation = validateScene(draft);
  if (!validation.ok) {
    return rejectEdit(state, rejectionMessage(validation.errors));
  }

  return { ...state, scene: validation.scene, editNotice: null };
}

function selectionExists(scene: SceneSpec, selection: EditorSelection): boolean {
  if (selection === null || selection.type === "listener") return true;
  const collection =
    selection.type === "source"
      ? scene.sources
      : selection.type === "wall"
        ? scene.walls
        : scene.portals;
  return collection.some(({ id }) => id === selection.id);
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "LOAD_PRESET": {
      const scene = structuredClone(PRESETS[action.presetId]);
      scene.revision = state.scene.revision + 1;
      return {
        ...state,
        scene,
        selectedObject: selectionForScene(scene),
        editNotice: null,
      };
    }
    case "SELECT_OBJECT":
      return selectionExists(state.scene, action.selection)
        ? { ...state, selectedObject: action.selection }
        : state;
    case "MOVE_LISTENER":
      return commitScene(state, (draft) => {
        draft.listener.position = { ...action.position };
      });
    case "MOVE_SOURCE":
      return commitScene(state, (draft) => {
        const source = draft.sources.find(({ id }) => id === action.sourceId);
        if (!source) return false;
        source.position = { ...action.position };
      });
    case "ADD_WALL": {
      const next = commitScene(state, (draft) => {
        draft.walls.push(structuredClone(action.wall));
      });
      return next.scene === state.scene
        ? next
        : { ...next, selectedObject: { type: "wall", id: action.wall.id } };
    }
    case "MOVE_WALL_ENDPOINT":
      return commitScene(state, (draft) => {
        const wall = draft.walls.find(({ id }) => id === action.wallId);
        if (!wall) return false;
        const oldA = { ...wall.a };
        const oldB = { ...wall.b };
        const oldDx = oldB.x - oldA.x;
        const oldDy = oldB.y - oldA.y;
        const oldLengthSquared = oldDx * oldDx + oldDy * oldDy;
        const hostedPortals = draft.portals
          .filter(({ wallId }) => wallId === wall.id)
          .map((portal) => ({
            portal,
            projection:
              ((portal.center.x - oldA.x) * oldDx +
                (portal.center.y - oldA.y) * oldDy) /
              oldLengthSquared,
          }));
        wall[action.endpoint] = { ...action.position };
        const newDx = wall.b.x - wall.a.x;
        const newDy = wall.b.y - wall.a.y;
        for (const { portal, projection } of hostedPortals) {
          portal.center = {
            x: wall.a.x + projection * newDx,
            y: wall.a.y + projection * newDy,
          };
        }
      });
    case "DELETE_WALL": {
      const next = commitScene(state, (draft) => {
        const index = draft.walls.findIndex(({ id }) => id === action.wallId);
        if (index < 0) return false;
        draft.walls.splice(index, 1);
        draft.portals = draft.portals.filter(({ wallId }) => wallId !== action.wallId);
      });
      return next.scene === state.scene
        ? next
        : {
            ...next,
            selectedObject: selectionExists(next.scene, state.selectedObject)
              ? state.selectedObject
              : null,
          };
    }
    case "SET_WALL_MATERIAL":
      return commitScene(state, (draft) => {
        const wall = draft.walls.find(({ id }) => id === action.wallId);
        if (!wall) return false;
        wall.materialId = action.materialId;
      });
    case "TOGGLE_PORTAL":
      return commitScene(state, (draft) => {
        const portal = draft.portals.find(({ id }) => id === action.portalId);
        if (!portal) return false;
        portal.open = !portal.open;
      });
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "SET_AUDIO_STATUS":
      return { ...state, audioStatus: action.status };
  }
}
