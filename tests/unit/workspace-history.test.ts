import { describe, expect, it } from "vitest";

import { createDefaultClassicProject, createDefaultHybridProject } from "@/domain/workspace/defaults";
import {
  createHistory,
  redoHistory,
  reduceWithHistory,
  resetActiveMode,
  undoHistory,
  shouldRecordProjectAction,
} from "@/domain/workspace/history";
import { projectReducer } from "@/domain/workspace/project-reducer";

describe("workspace history", () => {
  it("records scene-changing commands and supports undo and redo", () => {
    const history = createHistory(createDefaultClassicProject());
    const next = reduceWithHistory(history, {
      type: "ADD_LISTENER",
      listener: {
        id: "listener_b",
        name: "Listener B",
        position: { x: 2, y: 1.5, z: 3 },
        headingDeg: 0,
        enabled: true,
      },
    }, projectReducer);

    expect(next.past).toHaveLength(1);
    expect(undoHistory(next).present).toEqual(history.present);
    expect(redoHistory(undoHistory(next)).present).toEqual(next.present);
    expect(JSON.stringify(next.past[0]).length).toBeLessThan(JSON.stringify(next.present).length / 2);
  });

  it("does not record selection-only commands", () => {
    const history = createHistory(createDefaultClassicProject());
    const next = reduceWithHistory(history, {
      type: "SELECT_ENTITY",
      selection: { type: "wall", id: "partition_center" },
    }, projectReducer, false);

    expect(next.past).toHaveLength(0);
    expect(next.present.selection).toEqual({ type: "wall", id: "partition_center" });
  });

  it("records active-listener changes but not ordinary selection", () => {
    expect(shouldRecordProjectAction({ type: "SELECT_ENTITY", selection: { type: "wall", id: "partition_center" } })).toBe(false);
    expect(shouldRecordProjectAction({ type: "SELECT_ENTITY", selection: { type: "listener", id: "listener_b" } })).toBe(true);
    expect(shouldRecordProjectAction({ type: "SET_ACTIVE_LISTENER", id: "listener_b" })).toBe(true);
  });

  it("bounds retained history to fifty entries", () => {
    let history = createHistory(createDefaultClassicProject());
    for (let index = 0; index < 60; index += 1) {
      history = reduceWithHistory(history, { type: "CLEAR_NOTICE" }, (project) => ({
        ...project,
        revision: project.revision + 1,
      }));
    }
    expect(history.past).toHaveLength(50);
  });

  it("resets only the active mode and keeps reset undoable", () => {
    const classic = reduceWithHistory(
      createHistory(createDefaultClassicProject()),
      {
        type: "ADD_LISTENER",
        listener: {
          id: "listener_b",
          name: "Listener B",
          position: { x: 2, y: 1.5, z: 3 },
          headingDeg: 0,
          enabled: true,
        },
      },
      projectReducer,
    );
    const hybrid = createHistory(createDefaultHybridProject());
    const workspace = { classic, hybrid };

    const reset = resetActiveMode(workspace, "classic-2d5d");

    expect(reset.hybrid).toEqual(hybrid);
    expect(reset.classic.present).toEqual(createDefaultClassicProject());
    expect(undoHistory(reset.classic).present).toEqual(classic.present);
  });
});
