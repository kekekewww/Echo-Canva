import { describe, expect, it } from "vitest";

import { compileHybridGeometry } from "@/acoustics/hybrid3d/compile";
import { computeHybridDirectFrame } from "@/acoustics/hybrid3d/direct";
import { resolveHybridAcousticPresentation } from "@/components/workspace/HybridViewportAdapter";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { createSceneDocumentV2 } from "@/domain/scene-document/serialize";

describe("Hybrid viewport acoustic presentation", () => {
  it("accepts a matching complete fallback frame for audio and overlays", () => {
    const document = createSceneDocumentV2(CONCRETE_PARTITION_PRESET, {
      spatial3d: {
        coordinateSystem: "x-right-y-up-z-forward",
        floorElevationM: 0,
        listenerHeightM: 1.5,
        sourceHeightsM: { radio: 1.3, rain: 1.5 },
      },
    });
    const frame = computeHybridDirectFrame(compileHybridGeometry(document));
    const notice = "Hybrid Worker pool unavailable; using deterministic serial fallback.";

    expect(resolveHybridAcousticPresentation({
      frame,
      source: "fallback",
      computeMs: 3,
      completedAtMs: 5,
      workerCount: 0,
      sourceComputeMsMax: 0,
      sourceComputeMsTotal: 0,
      notice,
    }, document)).toEqual({
      accepted: true,
      worker: "Fallback",
      headerStatus: `Fallback · ${notice}`,
    });
  });

  it("rejects stale fallback revisions and projection hashes", () => {
    const document = createSceneDocumentV2(CONCRETE_PARTITION_PRESET, {
      spatial3d: {
        coordinateSystem: "x-right-y-up-z-forward",
        floorElevationM: 0,
        listenerHeightM: 1.5,
        sourceHeightsM: { radio: 1.3, rain: 1.5 },
      },
    });
    const frame = computeHybridDirectFrame(compileHybridGeometry(document));
    const state = {
      frame,
      source: "fallback" as const,
      computeMs: 3,
      completedAtMs: 5,
      workerCount: 0,
      sourceComputeMsMax: 0,
      sourceComputeMsTotal: 0,
      notice: "fallback",
    };

    const staleRevision = structuredClone(document);
    staleRevision.baseScene.revision += 1;
    const staleProjection = structuredClone(document);
    (staleProjection.compatibility as { classicProjectionHash: string }).classicProjectionHash = "wrong";

    expect(resolveHybridAcousticPresentation(state, staleRevision).accepted).toBe(false);
    expect(resolveHybridAcousticPresentation(state, staleProjection).accepted).toBe(false);
  });
});
