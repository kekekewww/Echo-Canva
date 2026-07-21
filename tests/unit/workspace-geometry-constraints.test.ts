import { describe, expect, it } from "vitest";

import { createDefaultHybridProject } from "@/domain/workspace/defaults";
import {
  constrainPortal3D,
  constrainWall3D,
  resizeRoomAndClamp,
  toggleEntityEnabled,
} from "@/domain/workspace/geometry-constraints";

describe("workspace 3D geometry constraints", () => {
  it("resizes a rectangular room and clamps listener/source poses", () => {
    const project = createDefaultHybridProject();
    const moved = {
      ...project,
      listeners: [{ ...project.listeners[0]!, position: { x: 11, y: 2.8, z: 7 } }],
    };
    const result = resizeRoomAndClamp(moved, { ...project.room3d, widthM: 5, depthM: 4, heightM: 2.5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.room3d).toEqual({ ...project.room3d, widthM: 5, depthM: 4, heightM: 2.5 });
    expect(result.project.listeners[0]!.position).toEqual({ x: 5, y: 2.5, z: 4 });
    expect(result.project.scene.room.outerPolygon).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }]);
  });

  it("constrains wall length, thickness, bottom, and top", () => {
    const project = createDefaultHybridProject();
    const wall = project.scene.walls.find(({ kind }) => kind === "partition")!;
    expect(constrainWall3D(project, wall.id, { a: { x: 2, y: 2 }, b: { x: 2.05, y: 2 }, thicknessM: 0.2, bottomM: 0, topM: 2 }).ok).toBe(false);
    const valid = constrainWall3D(project, wall.id, { a: { x: 2, y: 1 }, b: { x: 2, y: 3 }, thicknessM: 0.3, bottomM: 0.4, topM: 2.4 });
    expect(valid.ok).toBe(true);
  });

  it("keeps a Portal attached and inside vertical wall bounds", () => {
    const project = createDefaultHybridProject();
    const portal = project.scene.portals[0]!;
    expect(constrainPortal3D(project, portal.id, { center: { x: 2, y: 2 }, widthM: 1, bottomM: 0, topM: 2, thicknessM: 0.1 }).ok).toBe(true);
    expect(constrainPortal3D(project, portal.id, { center: portal.center, widthM: 1, bottomM: 0.2, topM: 2, thicknessM: 0.1 }).ok).toBe(true);
  });

  it("preserves a hosted Portal's normalized offset and disabled state when a Wall moves", () => {
    const project = createDefaultHybridProject();
    const portal = project.scene.portals[0]!;
    const wall = project.scene.walls.find(({ id }) => id === portal.wallId)!;
    const disabledId = project.scene.walls.find(({ id }) => id !== wall.id)!.id;
    const originalLength = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    const originalOffset = Math.hypot(portal.center.x - wall.a.x, portal.center.y - wall.a.y) / originalLength;
    const prepared = { ...project, disabledEntityIds: [disabledId] };

    const result = constrainWall3D(prepared, wall.id, {
      a: { x: 1, y: 1 }, b: { x: 7, y: 1 }, thicknessM: 0.25, bottomM: 0, topM: 2.8,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const movedPortal = result.project.scene.portals.find(({ id }) => id === portal.id)!;
    expect((movedPortal.center.x - 1) / 6).toBeCloseTo(originalOffset, 5);
    expect(result.project.disabledEntityIds).toContain(disabledId);
  });

  it("clamps Portal offset, width and vertical bounds to its finite host", () => {
    const project = createDefaultHybridProject();
    const portal = project.scene.portals[0]!;
    const wall = project.scene.walls.find(({ id }) => id === portal.wallId)!;
    const result = constrainPortal3D(project, portal.id, {
      center: { x: 999, y: 999 }, widthM: 99, bottomM: -2, topM: 99, thicknessM: 0.15,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const clamped = result.project.scene.portals.find(({ id }) => id === portal.id)!;
    expect(clamped.widthM).toBeLessThanOrEqual(Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y));
    expect(result.project.portal3dById[portal.id]?.bottomM).toBeGreaterThanOrEqual(0);
    expect(result.project.portal3dById[portal.id]?.topM).toBeLessThanOrEqual(result.project.wall3dById[wall.id]!.topM);
  });

  it("rejects floor disable and restores disabled geometry on re-enable", () => {
    const project = createDefaultHybridProject();
    const wall = project.scene.walls.find(({ kind }) => kind === "partition")!;
    const floor = toggleEntityEnabled(project, { type: "surface", id: "floor" }, false);
    expect(floor.ok).toBe(false);
    const disabled = toggleEntityEnabled(project, { type: "wall", id: wall.id }, false);
    expect(disabled.ok).toBe(true);
    if (!disabled.ok) return;
    expect(disabled.project.disabledEntityIds).toContain(wall.id);
    const restored = toggleEntityEnabled(disabled.project, { type: "wall", id: wall.id }, true);
    expect(restored.ok && restored.project.disabledEntityIds).not.toContain(wall.id);
  });
});
