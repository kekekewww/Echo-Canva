import { describe, expect, it } from "vitest";

import { buildPatchBvh, intersectSegmentBvh } from "@/acoustics/hybrid3d/bvh";
import {
  bindHybridPoses,
  compileHybridGeometry,
  compileHybridStaticGeometry,
} from "@/acoustics/hybrid3d/compile";
import {
  assembleHybridDirectFrame,
  computeHybridDirectFrame,
  computeHybridDirectPaths,
  computeHybridDirectSources,
  createHybridDirectPoseSnapshot,
  solveDirectPath3D,
} from "@/acoustics/hybrid3d/direct";
import { makePatch3, type Vec3 } from "@/acoustics/hybrid3d/geometry";
import { createSceneDocumentV2 } from "@/domain/scene-document/serialize";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import type { SceneSpec } from "@/domain/scene/types";

const EPSILON = 1e-5;

function closeTo(actual: number, expected: number, tolerance = EPSILON): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function hybridDocument(portalOpen = true) {
  const scene: SceneSpec = structuredClone(CONCRETE_PARTITION_PRESET);
  scene.portals[0]!.open = portalOpen;
  return createSceneDocumentV2(scene, {
    spatial3d: {
      coordinateSystem: "x-right-y-up-z-forward",
      floorElevationM: 0,
      listenerHeightM: 1.5,
      sourceHeightsM: { radio: 1.3, rain: 1.5 },
    },
  });
}

describe("Hybrid 3D direct propagation", () => {
  it("deep-equals ordered assembly when independently computed results arrive reversed", () => {
    const geometry = compileHybridGeometry(hybridDocument(false));
    const snapshot = createHybridDirectPoseSnapshot(geometry);
    const results = computeHybridDirectSources(
      snapshot,
      geometry.bvh,
      snapshot.sources.map(({ id }) => id).reverse(),
    );

    expect(assembleHybridDirectFrame(snapshot, results, 2468)).toEqual(
      computeHybridDirectFrame(geometry, 2468),
    );
  });

  it("retains authored source declaration order during assembly", () => {
    const document = hybridDocument(false);
    const reordered = createSceneDocumentV2({
      ...structuredClone(document.baseScene),
      sources: [...document.baseScene.sources].reverse(),
    }, document.extensions);
    const geometry = compileHybridGeometry(reordered);
    const snapshot = createHybridDirectPoseSnapshot(geometry);
    const results = computeHybridDirectSources(
      snapshot,
      geometry.bvh,
      [...snapshot.sources].reverse().map(({ id }) => id),
    );

    expect(assembleHybridDirectFrame(snapshot, results, 0).paths.map(({ sourceId }) => sourceId)).toEqual(
      reordered.baseScene.sources.map(({ id }) => id),
    );
  });

  it("rejects missing, duplicate, unknown, stale, and cross-static source results", () => {
    const geometry = compileHybridGeometry(hybridDocument(false));
    const snapshot = createHybridDirectPoseSnapshot(geometry);
    const results = computeHybridDirectSources(
      snapshot,
      geometry.bvh,
      snapshot.sources.map(({ id }) => id),
    );

    expect(() => assembleHybridDirectFrame(snapshot, results.slice(0, 1), 0)).toThrow(/missing/i);
    expect(() => assembleHybridDirectFrame(snapshot, [results[0]!, results[0]!], 0)).toThrow(/duplicate/i);
    expect(() => assembleHybridDirectFrame(snapshot, [
      results[0]!,
      { ...results[1]!, sourceId: "unknown" },
    ], 0)).toThrow(/unknown/i);
    expect(() => assembleHybridDirectFrame(snapshot, [
      results[0]!,
      { ...results[1]!, revision: snapshot.revision - 1 },
    ], 0)).toThrow(/revision/i);
    expect(() => assembleHybridDirectFrame(snapshot, [
      results[0]!,
      { ...results[1]!, staticFingerprint: "wrong" },
    ], 0)).toThrow(/fingerprint/i);
  });

  it("solves the G001 free-field 3-4-5 distance, delay, and elevation", () => {
    const result = solveDirectPath3D(
      { x: 0, y: 1.5, z: 0 },
      { x: 3, y: 1.5, z: 4 },
      buildPatchBvh([]),
    );

    expect(result.directVisible).toBe(true);
    closeTo(result.distanceM, 5);
    closeTo(result.delayMs, 14.5772594752, 0.00001);
    closeTo(result.elevationDeg, 0);
    closeTo(result.azimuthDeg, -143.1301023542, 0.00001);
  });

  it("reports a non-zero elevation without confusing it for horizontal distance", () => {
    const result = solveDirectPath3D(
      { x: 0, y: 3.5, z: 0 },
      { x: 0, y: 1.5, z: 4 },
      buildPatchBvh([]),
    );

    closeTo(result.distanceM, Math.sqrt(20));
    closeTo(result.elevationDeg, 26.5650511771, 0.00001);
    closeTo(result.azimuthDeg, 180, 0.00001);
  });

  it("extrudes the v1 room, preserving an open portal while closing it blocks the direct ray", () => {
    const openGeometry = compileHybridGeometry(hybridDocument(true));
    const openRadio = computeHybridDirectPaths(openGeometry).find(({ sourceId }) => sourceId === "radio");
    const closedGeometry = compileHybridGeometry(hybridDocument(false));
    const closedRadio = computeHybridDirectPaths(closedGeometry).find(({ sourceId }) => sourceId === "radio");

    expect(openGeometry.patches.some(({ kind }) => kind === "floor")).toBe(true);
    expect(openGeometry.patches.some(({ kind }) => kind === "ceiling")).toBe(true);
    expect(openGeometry.patches.some(({ kind }) => kind === "wall")).toBe(true);
    expect(openRadio).toMatchObject({ directVisible: true, routeType: "direct" });
    expect(closedRadio).toMatchObject({ directVisible: false, routeType: "blocked" });
    expect(closedRadio?.occluderWallIds).toEqual(["partition_center"]);
  });

  it("rejects an intersection outside a finite wall patch", () => {
    const patch = makePatch3("finite-wall", "wall", "concrete_hard", [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 2 },
      { x: 0, y: 2, z: 2 },
      { x: 0, y: 2, z: 0 },
    ]);

    const result = solveDirectPath3D(
      { x: -1, y: 1, z: 4 },
      { x: 1, y: 1, z: 4 },
      buildPatchBvh([patch]),
    );

    expect(result.directVisible).toBe(true);
    expect(result.hits).toEqual([]);
  });

  it("reuses a static BVH when only source/listener elevations change", () => {
    const initial = hybridDocument(true);
    const structure = compileHybridStaticGeometry(initial);
    const moved = createSceneDocumentV2(structuredClone(initial.baseScene), {
      spatial3d: {
        coordinateSystem: "x-right-y-up-z-forward",
        floorElevationM: 0,
        listenerHeightM: 2.1,
        sourceHeightsM: { radio: 2.4, rain: 1.5 },
      },
    });

    const rebound = bindHybridPoses(structure, moved);

    expect(rebound.bvh).toBe(structure.bvh);
    expect(rebound.sourcePositions.radio?.y).toBe(2.4);
    expect(rebound.listenerPosition.y).toBe(2.1);
  });

  it("matches brute-force patch intersections for a deterministic segment set", () => {
    const geometry = compileHybridGeometry(hybridDocument(false));
    const segments: readonly [Vec3, Vec3][] = [
      [{ x: 3, y: 1.5, z: 4 }, { x: 9, y: 1.3, z: 4 }],
      [{ x: 2, y: 1.5, z: 1 }, { x: 10, y: 1.5, z: 7 }],
      [{ x: 1, y: 0.5, z: 1 }, { x: 11, y: 3, z: 7 }],
      [{ x: 6, y: 0.2, z: 0.5 }, { x: 6, y: 3.5, z: 7.5 }],
    ];

    for (const [start, end] of segments) {
      const bvhHits = intersectSegmentBvh(start, end, geometry.bvh).map(({ patchId }) => patchId);
      const directHits = geometry.patches
        .flatMap((patch) => {
          const hit = solveDirectPath3D(start, end, buildPatchBvh([patch])).hits[0];
          return hit ? [hit.patchId] : [];
        })
        .sort();
      expect(bvhHits.sort()).toEqual(directHits);
    }
  });
});
