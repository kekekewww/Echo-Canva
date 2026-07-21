import { computeAcousticFrame, type AcousticFrame } from "@/acoustics/compute-frame";
import type { AcousticEngineMode, AcousticFrameEnvelope } from "@/acoustics/runtime/frame-envelope";
import {
  createHybrid3DFlags,
  type Hybrid3DFlags,
} from "@/acoustics/runtime/feature-flags";
import type { SceneSpec } from "@/domain/scene/types";

export type AcousticEngine = Readonly<{
  mode: AcousticEngineMode;
  compute: (scene: SceneSpec, generatedAtMs?: number) => AcousticFrame;
  dispose: () => void;
}>;

export type EngineSelection = Readonly<{
  requestedMode: AcousticEngineMode;
  activeMode: AcousticEngineMode;
  fallbackReason?: string;
}>;

export type EngineRouterOptions = Readonly<{
  flags?: Hybrid3DFlags;
  createClassic?: () => AcousticEngine;
  createHybrid?: () => AcousticEngine;
}>;

function createClassicEngine(): AcousticEngine {
  return {
    mode: "classic-2d5d",
    compute: computeAcousticFrame,
    dispose: () => undefined,
  };
}

export class EngineRouter {
  private readonly flags: Hybrid3DFlags;
  private readonly createClassic: () => AcousticEngine;
  private readonly createHybrid: (() => AcousticEngine) | undefined;
  private activeEngine: AcousticEngine;
  private fallbackReason: string | undefined;

  constructor(options: EngineRouterOptions = {}) {
    this.flags = options.flags ?? createHybrid3DFlags();
    this.createClassic = options.createClassic ?? createClassicEngine;
    this.createHybrid = options.createHybrid;
    this.activeEngine = this.createClassic();
  }

  get activeMode(): AcousticEngineMode {
    return this.activeEngine.mode;
  }

  select(requestedMode: AcousticEngineMode): EngineSelection {
    if (requestedMode === "hybrid-3d" && !this.flags.spatial3d) {
      this.fallbackReason = "Hybrid 3D is disabled by feature flags.";
      return {
        requestedMode,
        activeMode: this.activeEngine.mode,
        fallbackReason: this.fallbackReason,
      };
    }
    if (requestedMode === "hybrid-3d" && !this.createHybrid) {
      this.fallbackReason = "Hybrid 3D is not installed in this build.";
      return {
        requestedMode,
        activeMode: this.activeEngine.mode,
        fallbackReason: this.fallbackReason,
      };
    }
    if (requestedMode === this.activeEngine.mode) {
      this.fallbackReason = undefined;
      return { requestedMode, activeMode: this.activeEngine.mode };
    }

    const next = requestedMode === "classic-2d5d" ? this.createClassic() : this.createHybrid!();
    this.activeEngine.dispose();
    this.activeEngine = next;
    this.fallbackReason = undefined;
    return { requestedMode, activeMode: this.activeEngine.mode };
  }

  compute(scene: SceneSpec, generatedAtMs = 0): AcousticFrameEnvelope {
    return {
      engine: this.activeEngine.mode,
      frame: this.activeEngine.compute(scene, generatedAtMs),
      flags: this.flags,
      ...(this.fallbackReason ? { fallbackReason: this.fallbackReason } : {}),
    };
  }

  dispose(): void {
    this.activeEngine.dispose();
  }
}
