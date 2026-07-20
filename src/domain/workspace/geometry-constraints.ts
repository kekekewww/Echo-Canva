import { MIN_WALL_LENGTH_M, distance, portalFitsWall } from "@/domain/scene/geometry-validation";
import { validateScene } from "@/domain/scene/validate";
import { projectReducer } from "@/domain/workspace/project-reducer";
import { constrainPrimitiveToRoom } from "@/domain/workspace/primitives";
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

function fitVertical(
  bottom: number,
  top: number,
  hostBottom: number,
  hostTop: number,
  minimumHeight: number,
): Readonly<{ bottomM: number; topM: number }> {
  const bottomM = clamp(bottom, hostBottom, hostTop - minimumHeight);
  return { bottomM, topM: clamp(top, bottomM + minimumHeight, hostTop) };
}

export function resizeRoomAndClamp(project: WorkspaceProject, dimensions: Room3D): ConstraintResult {
  if (dimensions.widthM < 1 || dimensions.depthM < 1 || dimensions.heightM < 2 ||
      dimensions.widthM > 50 || dimensions.depthM > 50 || dimensions.heightM > 12) {
    return { ok: false, message: "Room width/depth must be 1–50 m and height must be 2–12 m." };
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
  let clampedCount = 0;
  for (const wall of scene.walls.filter(({ kind }) => kind === "partition")) {
    const old = structuredClone(wall);
    wall.a = { x: clamp(wall.a.x, 0, dimensions.widthM), y: clamp(wall.a.y, 0, dimensions.depthM) };
    wall.b = { x: clamp(wall.b.x, 0, dimensions.widthM), y: clamp(wall.b.y, 0, dimensions.depthM) };
    if (distance(wall.a, wall.b) < MIN_WALL_LENGTH_M) {
      const roomCanFitX = dimensions.widthM >= MIN_WALL_LENGTH_M;
      wall.b = roomCanFitX
        ? { x: clamp(wall.a.x + MIN_WALL_LENGTH_M, 0, dimensions.widthM), y: wall.a.y }
        : { x: wall.a.x, y: clamp(wall.a.y + MIN_WALL_LENGTH_M, 0, dimensions.depthM) };
      if (distance(wall.a, wall.b) < MIN_WALL_LENGTH_M) {
        wall.a = { x: 0, y: 0 };
        wall.b = { x: Math.min(dimensions.widthM, MIN_WALL_LENGTH_M), y: 0 };
      }
    }
    if (wall.a.x !== old.a.x || wall.a.y !== old.a.y || wall.b.x !== old.b.x || wall.b.y !== old.b.y) clampedCount += 1;
  }
  for (const portal of scene.portals) {
    const oldWall = project.scene.walls.find(({ id }) => id === portal.wallId);
    const newWall = scene.walls.find(({ id }) => id === portal.wallId);
    if (!oldWall || !newWall) continue;
    const oldDx = oldWall.b.x - oldWall.a.x;
    const oldDy = oldWall.b.y - oldWall.a.y;
    const oldLengthSquared = oldDx * oldDx + oldDy * oldDy;
    const fraction = oldLengthSquared > 0
      ? ((portal.center.x - oldWall.a.x) * oldDx + (portal.center.y - oldWall.a.y) * oldDy) / oldLengthSquared
      : 0.5;
    const newDx = newWall.b.x - newWall.a.x;
    const newDy = newWall.b.y - newWall.a.y;
    const newLength = Math.hypot(newDx, newDy);
    portal.widthM = clamp(portal.widthM, 0.4, Math.max(0.4, newLength - 0.02));
    const halfFraction = portal.widthM / (2 * newLength);
    const fittedFraction = clamp(fraction, halfFraction, 1 - halfFraction);
    portal.center = {
      x: newWall.a.x + newDx * fittedFraction,
      y: newWall.a.y + newDy * fittedFraction,
    };
  }
  for (const source of scene.sources) {
    const x = clamp(source.position.x, 0, dimensions.widthM);
    const y = clamp(source.position.y, 0, dimensions.depthM);
    if (x !== source.position.x || y !== source.position.y) clampedCount += 1;
    source.position = { x, y };
  }
  const wall3dById = Object.fromEntries(Object.entries(project.wall3dById).map(([id, vertical]) => {
    const fit = fitVertical(vertical.bottomM, vertical.topM, 0, dimensions.heightM, 0.1);
    return [id, { ...vertical, ...fit }];
  }));
  const portal3dById = Object.fromEntries(Object.entries(project.portal3dById).map(([id, vertical]) => {
    const portal = scene.portals.find((candidate) => candidate.id === id);
    const host = portal ? wall3dById[portal.wallId] : undefined;
    const fit = fitVertical(vertical.bottomM, vertical.topM, host?.bottomM ?? 0, host?.topM ?? dimensions.heightM, 0.4);
    if (portal) portal.heightM = fit.topM - fit.bottomM;
    return [id, { ...vertical, ...fit }];
  }));
  scene.revision = project.revision + 1;
  const validation = validateScene(scene);
  if (!validation.ok) return { ok: false, message: validation.errors[0]?.message ?? "Room resize rejected." };
  return {
    ok: true,
    project: {
      ...project,
      revision: scene.revision,
      room3d: dimensions,
      scene: validation.scene,
      listeners: project.listeners.map((listener) => ({
        ...listener,
        position: {
          x: clamp(listener.position.x, 0, dimensions.widthM),
          y: clamp(listener.position.y, 0.1, dimensions.heightM),
          z: clamp(listener.position.z, 0, dimensions.depthM),
        },
      })),
      sourceHeightsM: Object.fromEntries(Object.entries(project.sourceHeightsM).map(([id, height]) => [id, clamp(height, 0.1, dimensions.heightM)])),
      wall3dById,
      portal3dById,
      primitives: project.primitives.map((primitive) => constrainPrimitiveToRoom(primitive, dimensions)),
      notice: clampedCount > 0 ? { code: "geometry_clamped", message: `${clampedCount} object${clampedCount === 1 ? " was" : "s were"} clamped to the resized room.` } : null,
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
  if (candidate.bottomM < 0 || candidate.topM > project.room3d.heightM || candidate.topM - candidate.bottomM < 0.1) {
    return { ok: false, message: "Wall vertical bounds must fit the room and leave at least 0.10 m height." };
  }
  const wall = project.scene.walls.find(({ id }) => id === wallId);
  if (!wall) return { ok: false, message: "Wall not found." };
  const scene = structuredClone(project.scene);
  const draftWall = scene.walls.find(({ id }) => id === wallId)!;
  const oldDx = wall.b.x - wall.a.x;
  const oldDy = wall.b.y - wall.a.y;
  const oldLengthSquared = oldDx * oldDx + oldDy * oldDy;
  const newDx = candidate.b.x - candidate.a.x;
  const newDy = candidate.b.y - candidate.a.y;
  const newLength = Math.hypot(newDx, newDy);
  Object.assign(draftWall, { a: candidate.a, b: candidate.b, thicknessM: candidate.thicknessM });
  const portal3dById = { ...project.portal3dById };
  for (const portal of scene.portals.filter(({ wallId: host }) => host === wallId)) {
    const normalizedOffset = oldLengthSquared > 0
      ? ((portal.center.x - wall.a.x) * oldDx + (portal.center.y - wall.a.y) * oldDy) / oldLengthSquared
      : 0.5;
    portal.widthM = clamp(portal.widthM, 0.4, Math.max(0.4, newLength - 0.02));
    const halfFraction = portal.widthM / (2 * newLength);
    const fraction = clamp(normalizedOffset, halfFraction, 1 - halfFraction);
    portal.center = { x: candidate.a.x + newDx * fraction, y: candidate.a.y + newDy * fraction };
    const previous = portal3dById[portal.id] ?? { bottomM: 0, topM: portal.heightM, thicknessM: 0.12 };
    const vertical = fitVertical(previous.bottomM, previous.topM, candidate.bottomM, candidate.topM, 0.4);
    portal.heightM = vertical.topM - vertical.bottomM;
    portal3dById[portal.id] = { ...previous, ...vertical };
  }
  scene.revision = project.revision + 1;
  const validation = validateScene(scene);
  if (!validation.ok) return { ok: false, message: validation.errors[0]?.message ?? "Wall edit rejected." };
  return {
    ok: true,
    project: {
      ...project,
      revision: scene.revision,
      scene: validation.scene,
      wall3dById: { ...project.wall3dById, [wallId]: {
        bottomM: candidate.bottomM,
        topM: candidate.topM,
        thicknessM: candidate.thicknessM,
      } },
      portal3dById,
      notice: null,
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
  if (candidate.thicknessM < 0.02 || candidate.thicknessM > 2) return { ok: false, message: "Portal thickness must be 0.02–2 m." };
  const wallVertical = project.wall3dById[wall.id] ?? { bottomM: 0, topM: project.room3d.heightM, thicknessM: wall.thicknessM };
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const wallLength = Math.hypot(dx, dy);
  const ux = dx / wallLength;
  const uy = dy / wallLength;
  const widthM = clamp(candidate.widthM, 0.4, Math.max(0.4, wallLength - 0.02));
  const rawOffset = (candidate.center.x - wall.a.x) * ux + (candidate.center.y - wall.a.y) * uy;
  const offsetM = clamp(rawOffset, widthM / 2, wallLength - widthM / 2);
  const center = { x: wall.a.x + ux * offsetM, y: wall.a.y + uy * offsetM };
  const vertical = fitVertical(candidate.bottomM, candidate.topM, wallVertical.bottomM, wallVertical.topM, 0.4);
  const scene = structuredClone(project.scene);
  const draft = scene.portals.find(({ id }) => id === portalId)!;
  Object.assign(draft, { center, widthM, heightM: vertical.topM - vertical.bottomM });
  scene.revision = project.revision + 1;
  const validation = validateScene(scene);
  if (!validation.ok || !portalFitsWall(center, widthM, wall.a, wall.b)) {
    return { ok: false, message: validation.ok ? "Portal must stay attached to its host wall." : validation.errors[0]?.message ?? "Portal edit rejected." };
  }
  return {
    ok: true,
    project: {
      ...project,
      revision: scene.revision,
      scene: validation.scene,
      portal3dById: { ...project.portal3dById, [portalId]: { ...vertical, thicknessM: candidate.thicknessM } },
      notice: null,
    },
  };
}

export function toggleEntityEnabled(project: WorkspaceProject, entity: EntityRef, enabled: boolean): ConstraintResult {
  const next = projectReducer(project, { type: "SET_ENTITY_ENABLED", entity, enabled });
  return next.notice ? { ok: false, message: next.notice.message } : { ok: true, project: next };
}
