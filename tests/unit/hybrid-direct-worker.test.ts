import { describe, expect, it } from "vitest";

import {
  bindHybridPoses,
  compileHybridStaticGeometry,
} from "@/acoustics/hybrid3d/compile";
import {
  computeHybridDirectSources,
  createHybridDirectPoseSnapshot,
} from "@/acoustics/hybrid3d/direct";
import type { PatchBvh } from "@/acoustics/hybrid3d/bvh";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { createSceneDocumentV2 } from "@/domain/scene-document/serialize";
import type { SceneSpec } from "@/domain/scene/types";
import {
  createHybridDirectWorkerController,
  type HybridDirectWorkerResponse,
} from "@/workers/hybrid-direct.worker";

function documentWithHeights(listenerHeightM: number, radioHeightM: number) {
  const scene: SceneSpec = structuredClone(CONCRETE_PARTITION_PRESET);
  return createSceneDocumentV2(scene, {
    spatial3d: {
      coordinateSystem: "x-right-y-up-z-forward",
      floorElevationM: 0,
      listenerHeightM,
      sourceHeightsM: { radio: radioHeightM, rain: 1.5 },
    },
  });
}

describe("Hybrid direct source shard Worker controller", () => {
  it("does not retain the temporary legacy COMPUTE/FRAME runtime protocol", () => {
    const responses: HybridDirectWorkerResponse[] = [];
    const document = documentWithHeights(1.5, 1.3);
    const controller = createHybridDirectWorkerController({
      postMessage: (response) => responses.push(response),
    });

    controller.handle({ type: "COMPUTE", requestId: 1, document } as never);

    expect(responses).toEqual([]);
  });

  it("installs static geometry, computes requested IDs, and measures after calculation", () => {
    const responses: HybridDirectWorkerResponse[] = [];
    const document = documentWithHeights(1.5, 1.3);
    const structure = compileHybridStaticGeometry(document);
    const snapshot = createHybridDirectPoseSnapshot(bindHybridPoses(structure, document));
    const times = [20, 29];
    const controller = createHybridDirectWorkerController(
      { postMessage: (response) => responses.push(response) },
      { now: () => times.shift() ?? 29 },
    );

    controller.handle({ type: "INSTALL_STATIC", requestId: 1, structure });
    controller.handle({
      type: "COMPUTE_SHARD",
      requestId: 2,
      staticFingerprint: structure.staticGeometryHash,
      snapshot,
      sourceIds: ["radio"],
    });

    expect(responses[0]).toEqual({
      type: "STATIC_INSTALLED",
      requestId: 1,
      staticFingerprint: structure.staticGeometryHash,
    });
    expect(responses[1]).toMatchObject({
      type: "SHARD_RESULT",
      requestId: 2,
      staticFingerprint: structure.staticGeometryHash,
      revision: snapshot.revision,
      sourceIds: ["radio"],
      computeMs: 9,
      completedAtMs: 29,
      results: [{ sourceId: "radio" }],
    });
  });

  it("rejects missing and mismatched static geometry with typed errors", () => {
    const responses: HybridDirectWorkerResponse[] = [];
    const document = documentWithHeights(1.5, 1.3);
    const structure = compileHybridStaticGeometry(document);
    const snapshot = createHybridDirectPoseSnapshot(bindHybridPoses(structure, document));
    const controller = createHybridDirectWorkerController({
      postMessage: (response) => responses.push(response),
    });

    controller.handle({
      type: "COMPUTE_SHARD",
      requestId: 1,
      staticFingerprint: structure.staticGeometryHash,
      snapshot,
      sourceIds: ["radio"],
    });
    controller.handle({ type: "INSTALL_STATIC", requestId: 2, structure });
    controller.handle({
      type: "COMPUTE_SHARD",
      requestId: 3,
      staticFingerprint: "stale",
      snapshot,
      sourceIds: ["radio"],
    });

    expect(responses[0]).toMatchObject({ type: "ERROR", code: "HYBRID_STATIC_NOT_INSTALLED" });
    expect(responses[2]).toMatchObject({ type: "ERROR", code: "HYBRID_STATIC_FINGERPRINT_MISMATCH" });
  });

  it("reuses the installed BVH for pose-only shards and ignores work after disposal", () => {
    const responses: HybridDirectWorkerResponse[] = [];
    const initial = documentWithHeights(1.5, 1.3);
    const moved = documentWithHeights(2.1, 2.4);
    const structure = compileHybridStaticGeometry(initial);
    const seenBvhs: PatchBvh[] = [];
    const controller = createHybridDirectWorkerController(
      { postMessage: (response) => responses.push(response) },
      {
        computeSources: (snapshot, bvh, sourceIds) => {
          seenBvhs.push(bvh);
          return computeHybridDirectSources(snapshot, bvh, sourceIds);
        },
      },
    );

    controller.handle({ type: "INSTALL_STATIC", requestId: 1, structure });
    for (const [requestId, document] of [[2, initial], [3, moved]] as const) {
      controller.handle({
        type: "COMPUTE_SHARD",
        requestId,
        staticFingerprint: structure.staticGeometryHash,
        snapshot: createHybridDirectPoseSnapshot(bindHybridPoses(structure, document)),
        sourceIds: ["radio"],
      });
    }

    expect(seenBvhs).toEqual([structure.bvh, structure.bvh]);
    expect(responses).toHaveLength(3);
    controller.handle({ type: "DISPOSE", requestId: 4 });
    controller.handle({ type: "INSTALL_STATIC", requestId: 5, structure });
    expect(responses).toHaveLength(3);
  });
});
