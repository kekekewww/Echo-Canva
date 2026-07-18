import { describe, expect, it } from "vitest";

import { resolveHybridAudibleDirectState } from "@/acoustics/hybrid3d/audible-direct";
import { bindHybridPoses, compileHybridStaticGeometry } from "@/acoustics/hybrid3d/compile";
import { computeHybridDirectFrame } from "@/acoustics/hybrid3d/direct";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { createSceneDocumentV2 } from "@/domain/scene-document/serialize";
import type { SceneSpec } from "@/domain/scene/types";

function buildGeometry(options: Readonly<{
  listenerPlan: Readonly<{ x: number; z: number }>;
  radioPlan: Readonly<{ x: number; z: number }>;
  listenerHeightM?: number;
  radioHeightM?: number;
  portalOpen?: boolean;
  partitionMaterialId?: string;
}>) {
  const scene: SceneSpec = structuredClone(CONCRETE_PARTITION_PRESET);
  scene.listener.position = { x: options.listenerPlan.x, y: options.listenerPlan.z };
  scene.sources[0]!.position = { x: options.radioPlan.x, y: options.radioPlan.z };
  scene.portals[0]!.open = options.portalOpen ?? true;
  scene.walls = scene.walls.map((wall) => wall.id === "partition_center"
    ? { ...wall, materialId: options.partitionMaterialId ?? wall.materialId }
    : wall);
  const document = createSceneDocumentV2(scene, {
    spatial3d: {
      coordinateSystem: "x-right-y-up-z-forward",
      floorElevationM: 0,
      listenerHeightM: options.listenerHeightM ?? 1.5,
      sourceHeightsM: { radio: options.radioHeightM ?? 1.5, rain: 1.5 },
    },
  });
  const staticGeometry = compileHybridStaticGeometry(document);
  return bindHybridPoses(staticGeometry, document);
}

describe("resolveHybridAudibleDirectState", () => {
  it("uses the actual 3D source position for a clear direct path", () => {
    const geometry = buildGeometry({
      listenerPlan: { x: 3, z: 4 },
      radioPlan: { x: 9, z: 4 },
    });
    const result = resolveHybridAudibleDirectState(geometry, computeHybridDirectFrame(geometry));
    const radio = result.paths.find((path) => path.sourceId === "radio");

    expect(radio).toMatchObject({
      routeType: "direct",
      dryGainDb: 0,
      lowpassHz: 20_000,
      virtualPosition: { x: 9, y: 1.5, z: 4 },
    });
    expect(result.audioState.sourceStates.radio?.effectiveDistanceM).toBeCloseTo(6);
  });

  it("lifts the validated listener-facing portal to a 3D HRTF position when the direct path is blocked", () => {
    const geometry = buildGeometry({
      listenerPlan: { x: 3, z: 1.5 },
      radioPlan: { x: 9, z: 1.5 },
    });
    const result = resolveHybridAudibleDirectState(geometry, computeHybridDirectFrame(geometry));
    const radio = result.paths.find((path) => path.sourceId === "radio");

    expect(radio).toMatchObject({
      routeType: "portal",
      dryGainDb: -3,
      lowpassHz: 18_500,
      portalIds: ["partition_door"],
      virtualPosition: { x: 6, y: 1.05, z: 4 },
    });
    expect(radio?.effectiveDistanceM).toBeGreaterThan(6);
  });

  it("keeps an above-door 3D line blocked even when its X/Z projection crosses the opening", () => {
    const geometry = buildGeometry({
      listenerPlan: { x: 3, z: 4 },
      radioPlan: { x: 9, z: 4 },
      listenerHeightM: 2.8,
      radioHeightM: 2.8,
    });
    const result = resolveHybridAudibleDirectState(geometry, computeHybridDirectFrame(geometry));
    const radio = result.paths.find((path) => path.sourceId === "radio");

    expect(radio).toMatchObject({
      routeType: "blocked",
      dryGainDb: -34,
      lowpassHz: 700,
      portalIds: [],
    });
  });

  it("keeps blocked concrete and wood partitions audibly distinct", () => {
    const blockedOptions = {
      listenerPlan: { x: 3, z: 4 },
      radioPlan: { x: 9, z: 4 },
      portalOpen: false,
    } as const;
    const concreteGeometry = buildGeometry({ ...blockedOptions, partitionMaterialId: "concrete_hard" });
    const woodGeometry = buildGeometry({ ...blockedOptions, partitionMaterialId: "wood_medium" });
    const concrete = resolveHybridAudibleDirectState(
      concreteGeometry,
      computeHybridDirectFrame(concreteGeometry),
    ).paths.find((path) => path.sourceId === "radio");
    const wood = resolveHybridAudibleDirectState(
      woodGeometry,
      computeHybridDirectFrame(woodGeometry),
    ).paths.find((path) => path.sourceId === "radio");

    expect(concrete?.routeType).toBe("blocked");
    expect(wood?.routeType).toBe("blocked");
    expect(concrete?.dryGainDb).toBeLessThan(wood?.dryGainDb ?? 0);
    expect(concrete?.lowpassHz).toBeLessThan(wood?.lowpassHz ?? 20_000);
  });
});
