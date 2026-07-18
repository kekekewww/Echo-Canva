import { describe, expect, it } from "vitest";

import { portalFitsWall } from "@/domain/scene/geometry-validation";
import {
  constrainPartitionEndpoint,
  constrainPortalToPartition,
  partitionLength,
  portalEdgePoints,
  type HybridEditablePartition,
  type HybridEditablePortal,
} from "@/components/lab/partition-editing";

const partition: HybridEditablePartition = {
  a: { x: 6, z: 0.2 },
  b: { x: 6, z: 7.8 },
  thicknessM: 0.2,
  materialId: "concrete_hard",
};

const portal: HybridEditablePortal = {
  center: { x: 6, z: 4 },
  widthM: 1.2,
  heightM: 2.1,
  open: true,
};

describe("Hybrid partition editing", () => {
  it("rejects an endpoint move that would collapse the partition", () => {
    expect(constrainPartitionEndpoint(partition, "a", { x: 6, z: 7.4 })).toBe(partition);
  });

  it("keeps a moved endpoint inside the Lab room and above the minimum length", () => {
    const moved = constrainPartitionEndpoint(partition, "a", { x: -4, z: 2 });

    expect(moved.a).toEqual({ x: 0.2, z: 2 });
    expect(partitionLength(moved)).toBeGreaterThanOrEqual(1);
  });

  it("projects and clamps a Portal to its edited partition", () => {
    const edited = { ...partition, a: { x: 3, z: 1 }, b: { x: 10, z: 7 } };
    const constrained = constrainPortalToPartition({ ...portal, center: { x: 12, z: -3 }, widthM: 20 }, edited);
    const edges = portalEdgePoints(constrained, edited);

    expect(constrained.widthM).toBeLessThan(partitionLength(edited));
    expect(constrained.center.x).toBeGreaterThan(edited.a.x);
    expect(constrained.center.z).toBeGreaterThan(edited.a.z);
    expect(partitionLength({ ...edited, a: edges.near, b: edges.far })).toBeCloseTo(constrained.widthM, 1);
  });

  it("keeps a Portal exactly attached after an angled endpoint edit", () => {
    const edited = { ...partition, a: { x: 5, z: 2.1 }, b: { x: 6, z: 7.8 } };
    const constrained = constrainPortalToPartition(portal, edited);

    expect(portalFitsWall(
      { x: constrained.center.x, y: constrained.center.z },
      constrained.widthM,
      { x: edited.a.x, y: edited.a.z },
      { x: edited.b.x, y: edited.b.z },
    )).toBe(true);
  });
});
