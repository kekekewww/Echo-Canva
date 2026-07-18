import { describe, expect, it } from "vitest";

import { compileHybridStaticGeometry } from "@/acoustics/hybrid3d/compile";
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

describe("Hybrid direct Worker controller", () => {
  it("reuses static BVH geometry for pose-only updates and discards work after disposal", () => {
    const responses: HybridDirectWorkerResponse[] = [];
    let compileCount = 0;
    const controller = createHybridDirectWorkerController(
      { postMessage: (response) => responses.push(response) },
      {
        compileStatic: (document) => {
          compileCount += 1;
          return compileHybridStaticGeometry(document);
        },
        now: () => 100,
      },
    );
    const initial = documentWithHeights(1.5, 1.3);
    const moved = documentWithHeights(2.1, 2.4);

    controller.handle({ type: "COMPUTE", requestId: 1, document: initial });
    controller.handle({ type: "COMPUTE", requestId: 2, document: moved });

    expect(compileCount).toBe(1);
    expect(responses).toHaveLength(2);
    expect(responses[1]).toMatchObject({ type: "FRAME", requestId: 2 });
    const second = responses[1];
    if (second?.type !== "FRAME") throw new Error("Expected a Hybrid direct frame.");
    expect(second.frame.paths.find(({ sourceId }) => sourceId === "radio")?.elevationDeg).toBeGreaterThan(0);

    controller.handle({ type: "DISPOSE" });
    controller.handle({ type: "COMPUTE", requestId: 3, document: moved });
    expect(responses).toHaveLength(2);
  });
});
