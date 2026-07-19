import { describe, expect, it } from "vitest";

import { intersectSegmentBvh } from "@/acoustics/hybrid3d/bvh";
import { compileHybridGeometry } from "@/acoustics/hybrid3d/compile";
import { createDefaultHybridProject } from "@/domain/workspace/defaults";
import { projectReducer } from "@/domain/workspace/project-reducer";
import { projectHybridDocument } from "@/domain/workspace/projections";

function normalSegment(project = createDefaultHybridProject(), heightM = 1) {
  const portal = project.scene.portals[0]!;
  const wall = project.scene.walls.find(({ id }) => id === portal.wallId)!;
  const dx = wall.b.x - wall.a.x;
  const dz = wall.b.y - wall.a.y;
  const length = Math.hypot(dx, dz);
  const normal = { x: -dz / length, z: dx / length };
  return {
    portal,
    start: { x: portal.center.x - normal.x, y: heightM, z: portal.center.y - normal.z },
    end: { x: portal.center.x + normal.x, y: heightM, z: portal.center.y + normal.z },
  };
}

describe("Hybrid finite Wall and Portal compilation", () => {
  it("keeps an open Portal clear through the complete Wall thickness", () => {
    const project = createDefaultHybridProject();
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const { portal, start, end } = normalSegment(project);
    expect(intersectSegmentBvh(start, end, geometry.bvh).filter(({ wallId }) => wallId === portal.wallId)).toEqual([]);
  });

  it("compiles a closed Portal slab with the authored thickness", () => {
    const initial = createDefaultHybridProject();
    const portal = initial.scene.portals[0]!;
    const project = projectReducer(initial, { type: "UPDATE_PORTAL", id: portal.id, changes: { open: false }, vertical: { ...initial.portal3dById[portal.id]!, thicknessM: 0.3 } });
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const { start, end } = normalSegment(project);
    const hits = intersectSegmentBvh(start, end, geometry.bvh);

    expect(hits.some(({ patchId }) => patchId.startsWith(`${portal.id}:slab`))).toBe(true);
    const slabFaces = geometry.patches.filter(({ id }) => id.startsWith(`${portal.id}:slab-face`));
    expect(slabFaces).toHaveLength(2);
    const centers = slabFaces.map(({ vertices }) => vertices.reduce((sum, point) => sum + point.x + point.z, 0) / vertices.length);
    expect(Math.abs(centers[0]! - centers[1]!)).toBeGreaterThan(0);
  });

  it("adds finite end, top and bottom caps to every Wall extrusion", () => {
    const project = createDefaultHybridProject();
    const wall = project.scene.walls.find(({ kind }) => kind === "partition")!;
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const ids = new Set(geometry.patches.map(({ id }) => id));

    expect(ids).toContain(`${wall.id}:end-a`);
    expect(ids).toContain(`${wall.id}:end-b`);
    expect(ids).toContain(`${wall.id}:top`);
    expect(ids).toContain(`${wall.id}:bottom`);
  });
});
