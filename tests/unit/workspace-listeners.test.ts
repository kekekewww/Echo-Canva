import { describe, expect, it } from "vitest";

import { createDefaultClassicProject } from "@/domain/workspace/defaults";
import { projectReducer } from "@/domain/workspace/project-reducer";

describe("workspace listener and source limits", () => {
  it("activates a listener when it is clicked", () => {
    const added = projectReducer(createDefaultClassicProject(), {
      type: "ADD_LISTENER",
      listener: { id: "listener_b", name: "B", position: { x: 2, y: 1.5, z: 2 }, headingDeg: 0, enabled: true },
    });
    const selected = projectReducer(added, { type: "SELECT_ENTITY", selection: { type: "listener", id: added.listeners[0]!.id } });
    expect(selected.activeListenerId).toBe(added.listeners[0]!.id);
  });

  it("enforces four sources", () => {
    let project = createDefaultClassicProject();
    for (let index = 0; index < 3; index += 1) {
      project = projectReducer(project, {
        type: "ADD_SOURCE",
        heightM: 1.5,
        source: { id: `extra_${index}`, name: `Extra ${index}`, clipId: "radio_loop", sourceType: "point", position: { x: 2 + index, y: 2 }, gainDb: -6, loop: true },
      });
    }
    expect(project.scene.sources).toHaveLength(4);
    expect(project.notice?.code).toBe("limit_reached");
  });
});
