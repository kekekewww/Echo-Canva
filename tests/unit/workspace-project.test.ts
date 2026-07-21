import { describe, expect, it } from "vitest";

import {
  createDefaultClassicProject,
  createDefaultHybridProject,
} from "@/domain/workspace/defaults";
import { projectReducer } from "@/domain/workspace/project-reducer";

describe("workspace authoring projects", () => {
  it("creates independent projects with one active listener", () => {
    const classic = createDefaultClassicProject();
    const hybrid = createDefaultHybridProject();

    expect(classic.mode).toBe("classic-2d5d");
    expect(hybrid.mode).toBe("hybrid-3d");
    expect(classic.listeners).toHaveLength(1);
    expect(hybrid.listeners).toHaveLength(1);
    expect(classic.activeListenerId).toBe(classic.listeners[0]!.id);
    expect(hybrid.activeListenerId).toBe(hybrid.listeners[0]!.id);
    expect(classic.scene).not.toBe(hybrid.scene);
  });

  it("adds and activates listeners while preserving the prior listener", () => {
    const project = createDefaultHybridProject();
    const next = projectReducer(project, {
      type: "ADD_LISTENER",
      listener: {
        id: "listener_b",
        name: "Listener B",
        position: { x: 4, y: 1.7, z: 3 },
        headingDeg: 45,
        enabled: true,
      },
    });

    expect(next.listeners).toHaveLength(2);
    expect(next.activeListenerId).toBe("listener_b");
    expect(next.selection).toEqual({ type: "listener", id: "listener_b" });
    expect(project.listeners).toHaveLength(1);
  });

  it("switches the active listener when it is selected", () => {
    const added = projectReducer(createDefaultClassicProject(), {
      type: "ADD_LISTENER",
      listener: {
        id: "listener_b",
        name: "Listener B",
        position: { x: 2, y: 0, z: 2 },
        headingDeg: 0,
        enabled: true,
      },
    });
    const selected = projectReducer(added, {
      type: "SELECT_ENTITY",
      selection: { type: "listener", id: added.listeners[0]!.id },
    });

    expect(selected.activeListenerId).toBe(added.listeners[0]!.id);
    expect(selected.revision).toBe(added.revision + 1);
  });

  it("cannot delete or disable the final listener or the floor", () => {
    const project = createDefaultHybridProject();
    const listenerId = project.listeners[0]!.id;

    const deleted = projectReducer(project, { type: "DELETE_LISTENER", id: listenerId });
    const disabled = projectReducer(project, {
      type: "SET_ENTITY_ENABLED",
      entity: { type: "listener", id: listenerId },
      enabled: false,
    });
    const floor = projectReducer(project, {
      type: "SET_ENTITY_ENABLED",
      entity: { type: "surface", id: "floor" },
      enabled: false,
    });

    expect(deleted.listeners).toHaveLength(1);
    expect(deleted.notice?.code).toBe("listener_required");
    expect(disabled.listeners[0]!.enabled).toBe(true);
    expect(disabled.notice?.code).toBe("listener_required");
    expect(floor.disabledEntityIds).not.toContain("floor");
    expect(floor.notice?.code).toBe("floor_required");
  });

  it("falls back to the next enabled listener after deleting the active listener", () => {
    const project = projectReducer(createDefaultHybridProject(), {
      type: "ADD_LISTENER",
      listener: {
        id: "listener_b",
        name: "Listener B",
        position: { x: 6, y: 1.6, z: 5 },
        headingDeg: 0,
        enabled: true,
      },
    });
    const next = projectReducer(project, { type: "DELETE_LISTENER", id: "listener_b" });

    expect(next.activeListenerId).toBe(next.listeners[0]!.id);
    expect(next.selection).toEqual({ type: "listener", id: next.listeners[0]!.id });
  });

  it("rejects deleting the final enabled listener when disabled listeners remain", () => {
    const added = projectReducer(createDefaultHybridProject(), {
      type: "ADD_LISTENER",
      listener: {
        id: "listener_b",
        name: "Listener B",
        position: { x: 6, y: 1.6, z: 5 },
        headingDeg: 0,
        enabled: true,
      },
    });
    const firstListenerId = added.listeners[0]!.id;
    const selectedFirst = projectReducer(added, {
      type: "SELECT_ENTITY",
      selection: { type: "listener", id: firstListenerId },
    });
    const disabledFirst = projectReducer(selectedFirst, {
      type: "SET_ENTITY_ENABLED",
      entity: { type: "listener", id: firstListenerId },
      enabled: false,
    });

    const next = projectReducer(disabledFirst, {
      type: "DELETE_LISTENER",
      id: "listener_b",
    });

    expect(next.listeners).toHaveLength(2);
    expect(next.activeListenerId).toBe("listener_b");
    expect(next.notice?.code).toBe("listener_required");
  });

  it("updates source properties and clears a missing asset after relinking", () => {
    const initial = createDefaultClassicProject();
    const source = initial.scene.sources[0]!;
    const missing = { ...initial, missingAudioAssetIds: [source.clipId] };

    const updated = projectReducer(missing, {
      type: "UPDATE_SOURCE",
      id: source.id,
      changes: { name: "New radio", gainDb: -3, loop: false },
    });
    const relinked = projectReducer(updated, {
      type: "RELINK_SOURCE",
      id: source.id,
      clipId: "local_replacement",
    });

    expect(updated.scene.sources[0]).toMatchObject({ name: "New radio", gainDb: -3, loop: false });
    expect(relinked.scene.sources[0]?.clipId).toBe("local_replacement");
    expect(relinked.missingAudioAssetIds).not.toContain(source.clipId);
  });
});
