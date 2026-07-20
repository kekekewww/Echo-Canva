import { describe, expect, it } from "vitest";

import { buildPatchBvh } from "@/acoustics/hybrid3d/bvh";
import { solveDirectPath3D } from "@/acoustics/hybrid3d/direct";
import { representativePatches } from "@/acoustics/hybrid3d/reflections";
import { primitivePatches } from "@/acoustics/hybrid3d/primitives";
import type { AcousticPrimitive } from "@/domain/workspace/types";

function primitive(kind: AcousticPrimitive["kind"]): AcousticPrimitive {
  return {
    id: `${kind}_obstacle`,
    name: `${kind} obstacle`,
    kind,
    position: { x: 2, y: 1, z: 2 },
    dimensions: { x: 1, y: 2, z: 1 },
    rotationYDeg: 20,
    materialId: "wood_medium",
  };
}

describe("Hybrid basic acoustic primitives", () => {
  it("tessellates bounded planar patches for every supported shape", () => {
    expect(primitivePatches(primitive("box"))).toHaveLength(6);
    expect(primitivePatches(primitive("cylinder"))).toHaveLength(14);
    expect(primitivePatches(primitive("sphere"))).toHaveLength(32);
  });

  it("reports a primitive as a material-bearing direct-path occluder", () => {
    const box = primitive("box");
    const patches = primitivePatches(box);
    const path = solveDirectPath3D(
      { x: 0.5, y: 1, z: 2 },
      { x: 3.5, y: 1, z: 2 },
      buildPatchBvh(patches),
    );

    expect(path.routeType).toBe("blocked");
    expect(path.hits[0]).toMatchObject({ surfaceId: box.id, materialId: "wood_medium" });
    expect(representativePatches(buildPatchBvh(patches))).toHaveLength(6);
  });
});
