import { describe, expect, it, vi } from "vitest";

import { compileScene } from "@/ai/scene-compiler";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { createDefaultClassicProject, createDefaultHybridProject } from "@/domain/workspace/defaults";
import { projectReducer } from "@/domain/workspace/project-reducer";

function generatedScene() {
  const scene = structuredClone(CONCRETE_PARTITION_PRESET);
  scene.name = "Industrial Gallery";
  scene.room.outerPolygon = [
    { x: 0, y: 0 },
    { x: 14, y: 0 },
    { x: 14, y: 10 },
    { x: 0, y: 10 },
  ];
  scene.room.heightM = 4.5;
  scene.listener = { position: { x: 5, y: 3 }, headingDeg: 45 };
  scene.sources[0]!.position = { x: 10, y: 7 };
  scene.sources[1]!.position = { x: 2, y: 8 };
  return scene;
}

function generatedSpatial3d() {
  return {
    listenerHeightM: 1.7,
    sourceHeights: [
      { sourceId: "radio", heightM: 1.4 },
      { sourceId: "rain", heightM: 3.2 },
    ],
    wallVerticalBounds: CONCRETE_PARTITION_PRESET.walls.map(({ id }) => ({
      wallId: id,
      bottomM: 0,
      topM: id === "partition_center" ? 3.2 : 4.5,
    })),
    portalVerticalBounds: [
      { portalId: "partition_door", bottomM: 0, topM: 2, thicknessM: 0.3 },
    ],
  };
}

describe("mode-aware AI scene generation", () => {
  it("validates and returns a complete Hybrid 3D candidate", async () => {
    const scene = generatedScene();
    const spatial3d = generatedSpatial3d();
    const generateScene = vi.fn().mockResolvedValue({ scene, spatial3d });

    const result = await compileScene(
      { prompt: "a 14 by 10 by 4.5 metre gallery", targetMode: "hybrid-3d" },
      { generateScene },
    );

    expect(result).toMatchObject({
      ok: true,
      scene,
      spatial3d: {
        listenerHeightM: 1.7,
        sourceHeights: expect.arrayContaining([
          { sourceId: "radio", heightM: 1.4 },
          { sourceId: "rain", heightM: 3.2 },
        ]),
      },
    });
    expect(generateScene).toHaveBeenCalledTimes(1);
  });

  it("applies generated X/Y/Z and vertical geometry to the Hybrid project", () => {
    const next = projectReducer(createDefaultHybridProject(), {
      type: "REPLACE_SCENE",
      scene: generatedScene(),
      spatial3d: generatedSpatial3d(),
    } as never);

    expect(next.room3d).toMatchObject({ widthM: 14, depthM: 10, heightM: 4.5 });
    expect(next.listeners[0]!.position).toEqual({ x: 5, y: 1.7, z: 3 });
    expect(next.sourceHeightsM).toMatchObject({ radio: 1.4, rain: 3.2 });
    expect(next.wall3dById.partition_center).toMatchObject({ bottomM: 0, topM: 3.2 });
    expect(next.portal3dById.partition_door).toEqual({ bottomM: 0, topM: 2, thicknessM: 0.3 });
  });

  it("synchronizes Classic room controls with the generated floor-plan bounds", () => {
    const scene = generatedScene();
    scene.room.outerPolygon[2] = { x: 14, y: 9 };
    scene.room.outerPolygon[3] = { x: 0, y: 9 };

    const next = projectReducer(createDefaultClassicProject(), { type: "REPLACE_SCENE", scene });

    expect(next.room3d).toMatchObject({ widthM: 14, depthM: 9, heightM: 4.5 });
  });
});
