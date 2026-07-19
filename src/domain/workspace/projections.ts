import type { SceneSpec } from "@/domain/scene/types";
import { classicProjectionHash } from "@/domain/scene-document/validate";
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

  const extensions: SceneDocumentV2["extensions"] = {
    spatial3d: {
      coordinateSystem: "x-right-y-up-z-forward",
      floorElevationM: 0,
      listenerHeightM: listener.position.y,
      sourceHeightsM: Object.fromEntries(
        baseScene.sources.map(({ id }) => [id, project.sourceHeightsM[id] ?? 1.5]),
      ),
      wallVerticalBoundsM: Object.fromEntries(baseScene.walls.map(({ id }) => [id, {
        bottomM: project.wall3dById[id]?.bottomM ?? 0,
        topM: project.wall3dById[id]?.topM ?? heightM,
      }])),
      portalVerticalBoundsM: Object.fromEntries(baseScene.portals.map(({ id }) => [id, {
        bottomM: project.portal3dById[id]?.bottomM ?? 0,
        topM: project.portal3dById[id]?.topM ?? baseScene.portals.find((portal) => portal.id === id)!.heightM,
        thicknessM: project.portal3dById[id]?.thicknessM ?? 0.12,
      }])),
      disabledSurfaceIds: project.room3d.ceilingEnabled ? [] : ["ceiling"],
    },
    propagation3d: {
      maxReflectionOrder: 1,
      receiverConnection: false,
    },
  };

  // Workspace actions preserve schema/domain invariants before state is accepted.
  // This hot projection avoids repeating external-boundary validation on every pose update.
  return {
    documentVersion: "2.0",
    baseScene,
    extensions,
    compatibility: {
      migratedFrom: "1.0",
      classicProjectionHash: classicProjectionHash(baseScene),
    },
  };
}
