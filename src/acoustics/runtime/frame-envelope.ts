import type { AcousticFrame } from "@/acoustics/compute-frame";
import type { Hybrid3DFlags } from "@/acoustics/runtime/feature-flags";

export type AcousticEngineMode = "classic-2d5d" | "hybrid-3d";

export type AcousticFrameEnvelope = Readonly<{
  engine: AcousticEngineMode;
  frame: AcousticFrame;
  flags: Hybrid3DFlags;
  fallbackReason?: string;
}>;
