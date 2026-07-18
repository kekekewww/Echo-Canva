import {
  aabbCentroid3,
  intersectSegmentPatch,
  segmentIntersectsAabb3,
  unionAabb3,
  type Aabb3,
  type AcousticPatch3,
  type SegmentPatchHit,
  type Vec3,
} from "@/acoustics/hybrid3d/geometry";

type PatchBvhNode =
  | Readonly<{ kind: "leaf"; bounds: Aabb3; patchIndexes: readonly number[] }>
  | Readonly<{ kind: "branch"; bounds: Aabb3; left: PatchBvhNode; right: PatchBvhNode }>;

export type PatchBvh = Readonly<{
  patches: readonly AcousticPatch3[];
  root: PatchBvhNode | null;
}>;

function boundsForIndexes(patches: readonly AcousticPatch3[], indexes: readonly number[]): Aabb3 {
  const first = patches[indexes[0]!]!.aabb;
  return indexes.slice(1).reduce((bounds, index) => unionAabb3(bounds, patches[index]!.aabb), first);
}

function longestAxis(bounds: Aabb3): "x" | "y" | "z" {
  const x = bounds.max.x - bounds.min.x;
  const y = bounds.max.y - bounds.min.y;
  const z = bounds.max.z - bounds.min.z;
  if (x >= y && x >= z) return "x";
  if (y >= z) return "y";
  return "z";
}

function buildNode(patches: readonly AcousticPatch3[], indexes: readonly number[]): PatchBvhNode {
  const bounds = boundsForIndexes(patches, indexes);
  if (indexes.length <= 4) return { kind: "leaf", bounds, patchIndexes: [...indexes] };
  const axis = longestAxis(bounds);
  const ordered = [...indexes].sort((left, right) => {
    const delta = aabbCentroid3(patches[left]!.aabb)[axis] - aabbCentroid3(patches[right]!.aabb)[axis];
    return delta !== 0 ? delta : patches[left]!.id.localeCompare(patches[right]!.id);
  });
  const middle = Math.floor(ordered.length / 2);
  return {
    kind: "branch",
    bounds,
    left: buildNode(patches, ordered.slice(0, middle)),
    right: buildNode(patches, ordered.slice(middle)),
  };
}

export function buildPatchBvh(patches: readonly AcousticPatch3[]): PatchBvh {
  return {
    patches: [...patches],
    root: patches.length === 0 ? null : buildNode(patches, patches.map((_, index) => index)),
  };
}

export function intersectSegmentBvh(start: Vec3, end: Vec3, bvh: PatchBvh): readonly SegmentPatchHit[] {
  if (!bvh.root) return [];
  const hits: SegmentPatchHit[] = [];
  const visit = (node: PatchBvhNode): void => {
    if (!segmentIntersectsAabb3(start, end, node.bounds)) return;
    if (node.kind === "leaf") {
      for (const index of node.patchIndexes) {
        const hit = intersectSegmentPatch(start, end, bvh.patches[index]!);
        if (hit) hits.push(hit);
      }
      return;
    }
    visit(node.left);
    visit(node.right);
  };
  visit(bvh.root);
  return hits.sort((left, right) =>
    left.distanceM !== right.distanceM
      ? left.distanceM - right.distanceM
      : left.patchId.localeCompare(right.patchId),
  );
}
