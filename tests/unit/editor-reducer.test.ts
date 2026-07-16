import { describe, expect, it } from "vitest";

import { MATERIALS } from "@/domain/materials/registry";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { HARD_ROOM_PRESET } from "@/domain/presets/hard-room";
import { createEditorState } from "@/domain/editor/state";
import { editorReducer } from "@/domain/editor/reducer";

describe("editorReducer", () => {
  it("loads a fresh deterministic preset and advances the revision", () => {
    const initial = createEditorState(CONCRETE_PARTITION_PRESET);
    const moved = editorReducer(initial, {
      type: "MOVE_LISTENER",
      position: { x: 2, y: 2 },
    });

    const loaded = editorReducer(moved, {
      type: "LOAD_PRESET",
      presetId: "hard-room",
    });

    expect(loaded.scene).toEqual({
      ...structuredClone(HARD_ROOM_PRESET),
      revision: moved.scene.revision + 1,
    });
    expect(loaded.scene).not.toBe(HARD_ROOM_PRESET);
    expect(loaded.selectedObject).toEqual({ type: "source", id: "hard_radio" });
  });

  it("moves listener and sources immutably with one revision per edit", () => {
    const initial = createEditorState(CONCRETE_PARTITION_PRESET);
    const listenerMoved = editorReducer(initial, {
      type: "MOVE_LISTENER",
      position: { x: 2.25, y: 3.5 },
    });
    const sourceMoved = editorReducer(listenerMoved, {
      type: "MOVE_SOURCE",
      sourceId: "radio",
      position: { x: 8.25, y: 5.5 },
    });

    expect(listenerMoved.scene.listener.position).toEqual({ x: 2.25, y: 3.5 });
    expect(sourceMoved.scene.sources.find(({ id }) => id === "radio")?.position).toEqual({
      x: 8.25,
      y: 5.5,
    });
    expect(initial.scene.listener.position).toEqual({ x: 3, y: 4 });
    expect(listenerMoved.scene.revision).toBe(initial.scene.revision + 1);
    expect(sourceMoved.scene.revision).toBe(listenerMoved.scene.revision + 1);
  });

  it("adds, edits, assigns material to, and deletes a wall", () => {
    const initial = createEditorState(HARD_ROOM_PRESET);
    const added = editorReducer(initial, {
      type: "ADD_WALL",
      wall: {
        id: "partition_1",
        a: { x: 4, y: 2 },
        b: { x: 4, y: 6 },
        thicknessM: 0.12,
        materialId: "wood_medium",
        kind: "partition",
      },
    });
    const moved = editorReducer(added, {
      type: "MOVE_WALL_ENDPOINT",
      wallId: "partition_1",
      endpoint: "b",
      position: { x: 5, y: 6 },
    });
    const materialChanged = editorReducer(moved, {
      type: "SET_WALL_MATERIAL",
      wallId: "partition_1",
      materialId: "acoustic_treatment",
    });
    const deleted = editorReducer(materialChanged, {
      type: "DELETE_WALL",
      wallId: "partition_1",
    });

    expect(added.scene.walls).toHaveLength(initial.scene.walls.length + 1);
    expect(added.selectedObject).toEqual({ type: "wall", id: "partition_1" });
    expect(moved.scene.walls.at(-1)?.b).toEqual({ x: 5, y: 6 });
    expect(materialChanged.scene.walls.at(-1)?.materialId).toBe("acoustic_treatment");
    expect(deleted.scene.walls).toHaveLength(initial.scene.walls.length);
    expect(deleted.scene.revision).toBe(initial.scene.revision + 4);
  });

  it("keeps hosted portals at their normalized wall projection when an endpoint moves", () => {
    const initial = createEditorState(CONCRETE_PARTITION_PRESET);
    const moved = editorReducer(initial, {
      type: "MOVE_WALL_ENDPOINT",
      wallId: "partition_center",
      endpoint: "a",
      position: { x: 4, y: 0 },
    });

    expect(moved).not.toBe(initial);
    expect(moved.scene.walls.find(({ id }) => id === "partition_center")?.a).toEqual({
      x: 4,
      y: 0,
    });
    expect(moved.scene.portals.find(({ id }) => id === "partition_door")?.center).toEqual({
      x: 5,
      y: 4,
    });
    expect(moved.scene.revision).toBe(initial.scene.revision + 1);
  });

  it("cascade-deletes portals hosted by a deleted wall", () => {
    const initial = editorReducer(createEditorState(CONCRETE_PARTITION_PRESET), {
      type: "SELECT_OBJECT",
      selection: { type: "portal", id: "partition_door" },
    });
    const deleted = editorReducer(initial, {
      type: "DELETE_WALL",
      wallId: "partition_center",
    });

    expect(deleted).not.toBe(initial);
    expect(deleted.scene.walls.some(({ id }) => id === "partition_center")).toBe(false);
    expect(deleted.scene.portals.some(({ wallId }) => wallId === "partition_center")).toBe(false);
    expect(deleted.selectedObject).toBeNull();
    expect(deleted.scene.revision).toBe(initial.scene.revision + 1);
  });

  it("toggles a portal without mutating the preset", () => {
    const initial = createEditorState(CONCRETE_PARTITION_PRESET);
    const next = editorReducer(initial, {
      type: "TOGGLE_PORTAL",
      portalId: "partition_door",
    });

    expect(next.scene.portals[0]?.open).toBe(false);
    expect(initial.scene.portals[0]?.open).toBe(true);
    expect(next.scene.revision).toBe(initial.scene.revision + 1);
  });

  it("preserves scene identity and surfaces precise notices for invalid mutations", () => {
    const initial = createEditorState(CONCRETE_PARTITION_PRESET);
    const unknownMaterial = editorReducer(initial, {
      type: "SET_WALL_MATERIAL",
      wallId: "partition_center",
      materialId: "invented_material",
    });
    const outsideRoom = editorReducer(initial, {
      type: "MOVE_SOURCE",
      sourceId: "radio",
      position: { x: 99, y: 99 },
    });
    const shortWall = editorReducer(initial, {
      type: "ADD_WALL",
      wall: {
        id: "too_short",
        a: { x: 2, y: 2 },
        b: { x: 2.01, y: 2 },
        thicknessM: 0.12,
        materialId: MATERIALS[0]!.id,
        kind: "partition",
      },
    });
    const unknownSelection = editorReducer(initial, {
      type: "SELECT_OBJECT",
      selection: { type: "wall", id: "missing_wall" },
    });

    expect(unknownMaterial.scene).toBe(initial.scene);
    expect(unknownMaterial.editNotice).toEqual({
      kind: "rejection",
      message: "Material change rejected. Choose a built-in material preset.",
    });
    expect(outsideRoom.scene).toBe(initial.scene);
    expect(outsideRoom.editNotice?.message).toBe(
      "Move rejected. Keep sources and the listener inside the room.",
    );
    expect(shortWall.scene).toBe(initial.scene);
    expect(shortWall.editNotice?.message).toBe(
      "Wall edit rejected. Walls must be at least 0.10 m long.",
    );
    expect(unknownSelection).toBe(initial);
  });

  it("preserves scene identity when a wall move would detach its portal", () => {
    const initial = createEditorState(CONCRETE_PARTITION_PRESET);
    const rejected = editorReducer(initial, {
      type: "MOVE_WALL_ENDPOINT",
      wallId: "partition_center",
      endpoint: "a",
      position: { x: 6, y: 7.5 },
    });

    expect(rejected).not.toBe(initial);
    expect(rejected.scene).toBe(initial.scene);
    expect(rejected.editNotice?.message).toBe(
      "Wall edit rejected. Its hosted portal would become detached or no longer fit; keep the portal on the wall.",
    );
  });

  it("rejects a 101st wall with visible metadata and the exact previous scene", () => {
    const scene = structuredClone(CONCRETE_PARTITION_PRESET);
    scene.portals = [];
    scene.walls = Array.from({ length: 100 }, (_, index) => {
      const x = 0.2 + (index % 50) * 0.2;
      const y = index < 50 ? 0.5 : 1;
      return {
        id: `wall_${index}`,
        a: { x, y },
        b: { x, y: y + 0.5 },
        thicknessM: 0.12,
        materialId: "concrete_hard",
        kind: "partition" as const,
      };
    });
    const initial = createEditorState(scene);

    const rejected = editorReducer(initial, {
      type: "ADD_WALL",
      wall: {
        id: "wall_101",
        a: { x: 2, y: 2 },
        b: { x: 2, y: 3 },
        thicknessM: 0.12,
        materialId: "concrete_hard",
        kind: "partition",
      },
    });

    expect(rejected).not.toBe(initial);
    expect(rejected.scene).toBe(initial.scene);
    expect(rejected.editNotice?.message).toBe(
      "Wall limit reached (100). Delete a wall before adding another.",
    );
  });

  it("clears a rejection notice on the next successful scene edit", () => {
    const initial = createEditorState(CONCRETE_PARTITION_PRESET);
    const rejected = editorReducer(initial, {
      type: "MOVE_SOURCE",
      sourceId: "radio",
      position: { x: 99, y: 99 },
    });

    const recovered = editorReducer(rejected, {
      type: "MOVE_SOURCE",
      sourceId: "radio",
      position: { x: 8, y: 4 },
    });

    expect(rejected.scene).toBe(initial.scene);
    expect(rejected.editNotice).not.toBeNull();
    expect(recovered.scene).not.toBe(initial.scene);
    expect(recovered.editNotice).toBeNull();
  });

  it("updates control state without changing the scene revision", () => {
    const initial = createEditorState(CONCRETE_PARTITION_PRESET);
    const simulated = editorReducer(initial, { type: "SET_MODE", mode: "simulated" });
    const ready = editorReducer(simulated, {
      type: "SET_AUDIO_STATUS",
      status: "ready",
    });

    expect(ready.mode).toBe("simulated");
    expect(ready.audioStatus).toBe("ready");
    expect(ready.scene.revision).toBe(initial.scene.revision);
  });
});
