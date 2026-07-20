import { describe, expect, it } from "vitest";

import { createDefaultClassicProject, createDefaultHybridProject } from "@/domain/workspace/defaults";
import {
  constrainPrimitiveToRoom,
  primitiveFootprint,
  primitiveFootprintWalls,
} from "@/domain/workspace/primitives";
import type { AcousticPrimitive } from "@/domain/workspace/types";
import { projectReducer } from "@/domain/workspace/project-reducer";
import { projectClassicScene, projectHybridDocument } from "@/domain/workspace/projections";
import { validateSceneDocument } from "@/domain/scene-document/validate";

function primitive(kind: AcousticPrimitive["kind"]): AcousticPrimitive {
  return {
    id: `${kind}_1`,
    name: kind,
    kind,
    position: { x: 5, y: 1, z: 4 },
    dimensions: { x: 2, y: 2, z: 2 },
    rotationYDeg: 0,
    materialId: "concrete_hard",
  };
}

describe("workspace acoustic primitives", () => {
  it("starts both authoring modes with an empty primitive collection", () => {
    expect(createDefaultClassicProject()).toHaveProperty("primitives", []);
    expect(createDefaultHybridProject()).toHaveProperty("primitives", []);
  });

  it("creates stable Box, Cylinder, and Sphere plan footprints", () => {
    expect(primitiveFootprint(primitive("box"))).toHaveLength(4);
    expect(primitiveFootprint(primitive("cylinder"))).toHaveLength(12);
    expect(primitiveFootprint(primitive("sphere"))).toHaveLength(12);
    expect(primitiveFootprintWalls(primitive("box"))).toHaveLength(4);
    expect(primitiveFootprintWalls(primitive("cylinder"))).toHaveLength(12);
  });

  it("clamps primitive centers so their extents remain inside the room", () => {
    const outside = { ...primitive("box"), position: { x: 50, y: -2, z: 50 } };
    const constrained = constrainPrimitiveToRoom(outside, createDefaultHybridProject().room3d);

    expect(constrained.position).toEqual({ x: 11, y: 1, z: 7 });
  });

  it("shrinks a rotated box footprint when its diagonal cannot fit inside the room", () => {
    const constrained = constrainPrimitiveToRoom(
      {
        ...primitive("box"),
        position: { x: 0, y: 1, z: 0 },
        dimensions: { x: 12, y: 2, z: 8 },
        rotationYDeg: 45,
      },
      createDefaultHybridProject().room3d,
    );

    expect(primitiveFootprint(constrained).every(({ x, y }) => (
      x >= 0 && x <= 12 && y >= 0 && y <= 8
    ))).toBe(true);
  });

  it("adds, updates, disables, and deletes a primitive through project actions", () => {
    const initial = createDefaultHybridProject();
    const box = primitive("box");
    const added = projectReducer(initial, { type: "ADD_PRIMITIVE", primitive: box } as never);
    const updated = projectReducer(added, {
      type: "UPDATE_PRIMITIVE",
      id: box.id,
      changes: { materialId: "acoustic_treatment" },
    } as never);
    const disabled = projectReducer(updated, {
      type: "SET_ENTITY_ENABLED",
      entity: { type: "primitive", id: box.id },
      enabled: false,
    });
    const removed = projectReducer(disabled, { type: "DELETE_PRIMITIVE", id: box.id } as never);

    expect(added.primitives).toContainEqual(box);
    expect(updated.primitives[0]?.materialId).toBe("acoustic_treatment");
    expect(disabled.disabledEntityIds).toContain(box.id);
    expect(removed.primitives).toEqual([]);
  });

  it("projects primitive footprints only in Classic and complete records in Hybrid", () => {
    const box = primitive("box");
    const classic = { ...createDefaultClassicProject(), primitives: [box] };
    const hybrid = { ...createDefaultHybridProject(), primitives: [box] };

    expect(projectClassicScene(classic).walls.filter(({ id }) => id.startsWith("primitive:"))).toHaveLength(4);
    expect(projectHybridDocument(hybrid).baseScene.walls.some(({ id }) => id.startsWith("primitive:"))).toBe(false);
    expect(projectHybridDocument(hybrid).extensions.spatial3d?.primitives).toEqual([box]);
  });

  it("rejects external Hybrid documents whose primitive extents leave the room", () => {
    const project = createDefaultHybridProject();
    const document = projectHybridDocument({
      ...project,
      primitives: [{ ...primitive("box"), position: { x: 12, y: 1, z: 4 } }],
    });

    const validation = validateSceneDocument(document);
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.errors[0]?.code).toBe("primitive_out_of_room");
  });
});
