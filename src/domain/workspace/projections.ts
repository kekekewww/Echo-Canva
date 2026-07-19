import type { SceneSpec } from "@/domain/scene/types";
import { createSceneDocumentV2 } from "@/domain/scene-document/serialize";
import type { SceneDocumentV2 } from "@/domain/scene-document/types";
import type { WorkspaceProject } from "@/domain/workspace/types";

function activeListener(project: WorkspaceProject) {
  return (
    project.listeners.find(
      ({ id, enabled }) => id === project.activeListenerId && enabled,
    ) ?? project.listeners.find(({ enabled }) => enabled)!
  );
}

export function projectClassicScene(project: WorkspaceProject): SceneSpec {
  const scene = structuredClone(project.scene);
  const disabled = new Set(project.disabledEntityIds);
  const listener = activeListener(project);
  const walls = scene.walls.filter(({ id }) => !disabled.has(id));
  const wallIds = new Set(walls.map(({ id }) => id));

  return {
    ...scene,
    revision: project.revision,
    walls,
    portals: scene.portals.filter(
      ({ id, wallId }) => !disabled.has(id) && wallIds.has(wallId),
    ),
    sources: scene.sources.filter(({ id }) => !disabled.has(id)),
    listener: {
      position: { x: listener.position.x, y: listener.position.z },
      headingDeg: listener.headingDeg,
    },
  };
}

export function projectHybridDocument(project: WorkspaceProject): SceneDocumentV2 {
  const listener = activeListener(project);
  const baseScene = projectClassicScene(project);
  const { widthM, depthM, heightM } = project.room3d;
  baseScene.room = {
    ...baseScene.room,
    heightM,
    outerPolygon: [
      { x: 0, y: 0 },
      { x: widthM, y: 0 },
      { x: widthM, y: depthM },
      { x: 0, y: depthM },
    ],
  };

  return createSceneDocumentV2(baseScene, {
    spatial3d: {
      coordinateSystem: "x-right-y-up-z-forward",
      floorElevationM: 0,
      listenerHeightM: listener.position.y,
      sourceHeightsM: Object.fromEntries(
        baseScene.sources.map(({ id }) => [id, project.sourceHeightsM[id] ?? 1.5]),
      ),
    },
    propagation3d: {
      maxReflectionOrder: 1,
      receiverConnection: false,
    },
  });
}
