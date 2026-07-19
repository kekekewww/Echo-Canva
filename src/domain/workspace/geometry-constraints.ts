import { MIN_WALL_LENGTH_M, distance, portalFitsWall } from "@/domain/scene/geometry-validation";
import { projectReducer } from "@/domain/workspace/project-reducer";
import type {
  EntityRef,
  Portal3DSettings,
  Room3D,
  Wall3DSettings,
  WorkspaceProject,
} from "@/domain/workspace/types";

type ConstraintResult =
  | Readonly<{ ok: true; project: WorkspaceProject }>
  | Readonly<{ ok: false; message: string }>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function resizeRoomAndClamp(project: WorkspaceProject, dimensions: Room3D): ConstraintResult {
  if (dimensions.widthM < 1 || dimensions.depthM < 1 || dimensions.heightM < 2 ||
      dimensions.widthM > 50 || dimensions.depthM > 50 || dimensions.heightM > 12) {
    return { ok: false, message: "Room dimensions must stay within 1–50 m and height within 2–12 m." };
  }
  const scene = structuredClone(project.scene);
  const corners = [
    { x: 0, y: 0 }, { x: dimensions.widthM, y: 0 },
    { x: dimensions.widthM, y: dimensions.depthM }, { x: 0, y: dimensions.depthM },
  ];
  scene.room.outerPolygon = corners;
  scene.room.heightM = dimensions.heightM;
  const boundaries = scene.walls.filter(({ kind }) => kind === "boundary");
  boundaries.forEach((wall, index) => {
    wall.a = corners[index % 4]!;
    wall.b = corners[(index + 1) % 4]!;
  });
  for (const wall of scene.walls.filter(({ kind }) => kind === "partition")) {
    wall.a = { x: clamp(wall.a.x, 0, dimensions.widthM), y: clamp(wall.a.y, 0, dimensions.depthM) };
    wall.b = { x: clamp(wall.b.x, 0, dimensions.widthM), y: clamp(wall.b.y, 0, dimensions.depthM) };
  }
  for (const source of scene.sources) {
    source.position = { x: clamp(source.position.x, 0, dimensions.widthM), y: clamp(source.position.y, 0, dimensions.depthM) };
  }
  scene.revision = project.revision + 1;
  return {
    ok: true,
    project: {
      ...project,
      revision: scene.revision,
      room3d: dimensions,
      scene,
      listeners: project.listeners.map((listener) => ({
        ...listener,
        position: {
          x: clamp(listener.position.x, 0, dimensions.widthM),
          y: clamp(listener.position.y, 0.1, dimensions.heightM),
          z: clamp(listener.position.z, 0, dimensions.depthM),
        },
      })),
      sourceHeightsM: Object.fromEntries(Object.entries(project.sourceHeightsM).map(([id, height]) => [id, clamp(height, 0.1, dimensions.heightM)])),
      wall3dById: Object.fromEntries(Object.entries(project.wall3dById).map(([id, vertical]) => [id, { ...vertical, bottomM: clamp(vertical.bottomM, 0, dimensions.heightM - 0.1), topM: clamp(vertical.topM, 0.1, dimensions.heightM) }])),
      portal3dById: Object.fromEntries(Object.entries(project.portal3dById).map(([id, vertical]) => [id, { ...vertical, bottomM: clamp(vertical.bottomM, 0, dimensions.heightM - 0.1), topM: clamp(vertical.topM, 0.1, dimensions.heightM) }])),
      notice: null,
    },
  };
}

export function constrainWall3D(
  project: WorkspaceProject,
  wallId: string,
  candidate: Readonly<{ a: { x: number; y: number }; b: { x: number; y: number } }> & Wall3DSettings,
): ConstraintResult {
  if (distance(candidate.a, candidate.b) < MIN_WALL_LENGTH_M) return { ok: false, message: "Walls must be at least 0.10 m long." };
  if (candidate.thicknessM < 0.02 || candidate.thicknessM > 2) return { ok: false, message: "Wall thickness must be 0.02–2 m." };
  if (candidate.bottomM < 0 || candidate.topM > project.room3d.heightM || candidate.topM - candidate.bottomM < 0.1) return { ok: false, message: "Wall vertical bounds must fit the room and leave at least 0.10 m height." };
  const wall = project.scene.walls.find(({ id }) => id === wallId);
  if (!wall) return { ok: false, message: "Wall not found." };
  const scene = structuredClone(project.scene);
  const draftWall = scene.walls.find(({ id }) => id === wallId)!;
  draftWall.a = candidate.a;
  draftWall.b = candidate.b;
  draftWall.thicknessM = candidate.thicknessM;
  for (const portal of scene.portals.filter(({ wallId: host }) => host === wallId)) {
    const center = { x: (candidate.a.x + candidate.b.x) / 2, y: (candidate.a.y + candidate.b.y) / 2 };
    portal.center = center;
    portal.widthM = Math.max(0.4, Math.min(portal.widthM, distance(candidate.a, candidate.b) * 0.8));
  }
  const next = projectReducer(project, { type: "REPLACE_SCENE", scene });
  if (next.notice) return { ok: false, message: next.notice.message };
  return {
    ok: true,
    project: {
      ...next,
      wall3dById: { ...project.wall3dById, [wallId]: {
        bottomM: candidate.bottomM,
        topM: candidate.topM,
        thicknessM: candidate.thicknessM,
      } },
    },
  };
}

export function constrainPortal3D(
  project: WorkspaceProject,
  portalId: string,
  candidate: Readonly<{ center: { x: number; y: number }; widthM: number }> & Portal3DSettings,
): ConstraintResult {
  const portal = project.scene.portals.find(({ id }) => id === portalId);
  const wall = portal ? project.scene.walls.find(({ id }) => id === portal.wallId) : null;
  if (!portal || !wall) return { ok: false, message: "Portal or host wall not found." };
  const wallVertical = project.wall3dById[wall.id] ?? { bottomM: 0, topM: project.room3d.heightM, thicknessM: wall.thicknessM };
  if (!portalFitsWall(candidate.center, candidate.widthM, wall.a, wall.b)) return { ok: false, message: "Portal must stay attached to and fit within its host wall." };
  if (candidate.bottomM < wallVertical.bottomM || candidate.topM > wallVertical.topM || candidate.topM - candidate.bottomM < 0.4) return { ok: false, message: "Portal vertical bounds must fit within its host wall." };
  if (candidate.thicknessM < 0.02 || candidate.thicknessM > 2) return { ok: false, message: "Portal thickness must be 0.02–2 m." };
  const next = projectReducer(project, { type: "UPDATE_PORTAL", id: portalId, changes: { center: candidate.center, widthM: candidate.widthM, heightM: candidate.topM - candidate.bottomM }, vertical: candidate });
  return next.notice ? { ok: false, message: next.notice.message } : { ok: true, project: next };
}

export function toggleEntityEnabled(project: WorkspaceProject, entity: EntityRef, enabled: boolean): ConstraintResult {
  const next = projectReducer(project, { type: "SET_ENTITY_ENABLED", entity, enabled });
  return next.notice ? { ok: false, message: next.notice.message } : { ok: true, project: next };
}
