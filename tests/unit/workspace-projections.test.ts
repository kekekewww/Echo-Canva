import { describe, expect, it } from "vitest";

import { createDefaultHybridProject } from "@/domain/workspace/defaults";
import { projectReducer } from "@/domain/workspace/project-reducer";
import {
  projectClassicScene,
  projectHybridDocument,
} from "@/domain/workspace/projections";

describe("workspace engine projections", () => {
  it("projects exactly one active listener into the legacy scene contract", () => {
    const added = projectReducer(createDefaultHybridProject(), {
      type: "ADD_LISTENER",
      listener: {
        id: "listener_b",
        name: "Listener B",
        position: { x: 7, y: 1.8, z: 2.5 },
        headingDeg: 30,
        enabled: true,
      },
    });

    const scene = projectClassicScene(added);

    expect(scene.listener).toEqual({ position: { x: 7, y: 2.5 }, headingDeg: 30 });
    expect(scene).not.toBe(added.scene);
  });

  it("omits disabled walls and their hosted portals without deleting authoring data", () => {
    const project = createDefaultHybridProject();
    const wallId = project.scene.walls.find(({ kind }) => kind === "partition")!.id;
    const disabled = projectReducer(project, {
      type: "SET_ENTITY_ENABLED",
      entity: { type: "wall", id: wallId },
      enabled: false,
    });

    const scene = projectClassicScene(disabled);

    expect(disabled.scene.walls.some(({ id }) => id === wallId)).toBe(true);
    expect(scene.walls.some(({ id }) => id === wallId)).toBe(false);
    expect(scene.portals.some(({ wallId: hostId }) => hostId === wallId)).toBe(false);
  });

  it("projects room dimensions and vertical poses into a valid Hybrid document", () => {
    const project = createDefaultHybridProject();
    const document = projectHybridDocument(project);

    expect(document.documentVersion).toBe("2.0");
    expect(document.baseScene.room.outerPolygon).toEqual([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 8 },
      { x: 0, y: 8 },
    ]);
    expect(document.baseScene.room.heightM).toBe(3);
    expect(document.extensions.spatial3d?.listenerHeightM).toBe(1.5);
  });
});
