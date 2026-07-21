import { describe, expect, it } from "vitest";

import { computeAcousticFrame } from "@/acoustics/compute-frame";
import {
  EngineRouter,
  type AcousticEngine,
} from "@/acoustics/runtime/engine-router";
import { createHybrid3DFlags } from "@/acoustics/runtime/feature-flags";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";

function engine(mode: AcousticEngine["mode"], disposed: AcousticEngine["mode"][]): AcousticEngine {
  return {
    mode,
    compute: (scene, generatedAtMs) => computeAcousticFrame(scene, generatedAtMs),
    dispose: () => disposed.push(mode),
  };
}

describe("EngineRouter", () => {
  it("rejects feature combinations whose prerequisite solver is disabled", () => {
    expect(() => createHybrid3DFlags({ verticalReflections: true })).toThrow(/requires spatial3d/i);
    expect(() => createHybrid3DFlags({ spatial3d: true, secondOrderReflections: true })).toThrow(
      /requires verticalReflections/i,
    );
  });

  it("keeps Classic active when Hybrid 3D is not enabled", () => {
    const disposed: AcousticEngine["mode"][] = [];
    const router = new EngineRouter({
      flags: createHybrid3DFlags(),
      createClassic: () => engine("classic-2d5d", disposed),
      createHybrid: () => engine("hybrid-3d", disposed),
    });

    const result = router.select("hybrid-3d");

    expect(result).toEqual({
      requestedMode: "hybrid-3d",
      activeMode: "classic-2d5d",
      fallbackReason: "Hybrid 3D is disabled by feature flags.",
    });
    expect(router.compute(CONCRETE_PARTITION_PRESET).engine).toBe("classic-2d5d");
    router.dispose();
    expect(disposed).toEqual(["classic-2d5d"]);
  });

  it("switches engines repeatedly without retaining disposed instances", () => {
    const disposed: AcousticEngine["mode"][] = [];
    let created = 0;
    const router = new EngineRouter({
      flags: createHybrid3DFlags({ spatial3d: true }),
      createClassic: () => {
        created += 1;
        return engine("classic-2d5d", disposed);
      },
      createHybrid: () => {
        created += 1;
        return engine("hybrid-3d", disposed);
      },
    });

    for (let index = 0; index < 100; index += 1) {
      router.select(index % 2 === 0 ? "hybrid-3d" : "classic-2d5d");
      expect(router.compute(CONCRETE_PARTITION_PRESET).engine).toBe(
        index % 2 === 0 ? "hybrid-3d" : "classic-2d5d",
      );
    }

    expect(disposed).toHaveLength(created - 1);
    router.dispose();
    expect(disposed).toHaveLength(created);
  });
});
