import { dbToLinear, distanceAttenuation, equalPowerCrossfade } from "@/audio/math";
import {
  MODE_CROSSFADE_SECONDS,
  scheduleEqualPowerCrossfade,
  smoothParameter,
} from "@/audio/parameter-smoothing";
import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  GainNodeLike,
  PannerNodeLike,
} from "@/audio/types";
import type { PreviewMode } from "@/domain/editor/state";
import type { SceneSpec } from "@/domain/scene/types";

let nextGraphIdentity = 1;

type SceneSource = SceneSpec["sources"][number];
type SceneListener = SceneSpec["listener"];

export class SourceGraph {
  readonly identity = nextGraphIdentity++;
  readonly sourceId: string;
  private readonly sourceNode: AudioBufferSourceNodeLike;
  private readonly sourceGain: GainNodeLike;
  private readonly distanceGain: GainNodeLike;
  private readonly rawModeGain: GainNodeLike;
  private readonly simulatedModeGain: GainNodeLike;
  private readonly panner: PannerNodeLike;
  private readonly clipId: string;
  private readonly loop: boolean;
  private mode: PreviewMode;
  private modeTransition: Readonly<{
    fromMix: number;
    startTime: number;
    toMix: number;
  }> | null = null;
  private disposed = false;

  constructor(
    context: AudioContextLike,
    output: AudioNodeLike,
    source: SceneSource,
    listener: SceneListener,
    buffer: AudioBufferLike,
    mode: PreviewMode,
  ) {
    this.sourceId = source.id;
    this.clipId = source.clipId;
    this.loop = source.loop;
    this.mode = mode;

    const createdNodes: AudioNodeLike[] = [];
    let sourceNode: AudioBufferSourceNodeLike | null = null;
    let started = false;
    try {
      sourceNode = context.createBufferSource();
      createdNodes.push(sourceNode);
      const sourceGain = context.createGain();
      createdNodes.push(sourceGain);
      const distanceGain = context.createGain();
      createdNodes.push(distanceGain);
      const rawModeGain = context.createGain();
      createdNodes.push(rawModeGain);
      const simulatedModeGain = context.createGain();
      createdNodes.push(simulatedModeGain);
      const panner = context.createPanner();
      createdNodes.push(panner);

      this.sourceNode = sourceNode;
      this.sourceGain = sourceGain;
      this.distanceGain = distanceGain;
      this.rawModeGain = rawModeGain;
      this.simulatedModeGain = simulatedModeGain;
      this.panner = panner;

      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.maxDistance = 50;
      panner.rolloffFactor = 0;

      sourceNode.buffer = buffer;
      sourceNode.loop = source.loop;
      sourceNode.connect(sourceGain);
      sourceGain.connect(rawModeGain);
      rawModeGain.connect(output);
      sourceGain.connect(distanceGain);
      distanceGain.connect(panner);
      panner.connect(simulatedModeGain);
      simulatedModeGain.connect(output);

      this.initializeParameters(source, listener, mode);
      sourceNode.start();
      started = true;
    } catch (error) {
      if (started && sourceNode) {
        try {
          sourceNode.stop();
        } catch {
          // Best-effort rollback for a partially constructed browser graph.
        }
      }
      for (const node of createdNodes.reverse()) {
        try {
          node.disconnect();
        } catch {
          // Best-effort rollback for a partially constructed browser graph.
        }
      }
      throw error;
    }
  }

  matches(source: SceneSource): boolean {
    return source.clipId === this.clipId && source.loop === this.loop;
  }

  apply(source: SceneSource, listener: SceneListener, now: number): void {
    const distanceM = Math.hypot(
      source.position.x - listener.position.x,
      source.position.y - listener.position.y,
    );
    smoothParameter(this.sourceGain.gain, dbToLinear(source.gainDb), now);
    smoothParameter(this.distanceGain.gain, distanceAttenuation(distanceM), now);
    smoothParameter(this.panner.positionX, source.position.x - listener.position.x, now);
    smoothParameter(this.panner.positionY, 0, now);
    smoothParameter(this.panner.positionZ, -(source.position.y - listener.position.y), now);
  }

  applyMode(mode: PreviewMode, now: number): void {
    if (this.disposed || mode === this.mode) return;
    const toMix = mode === "simulated" ? 1 : 0;
    const fromMix = this.currentModeMix(now);
    scheduleEqualPowerCrossfade(
      this.rawModeGain.gain,
      this.simulatedModeGain.gain,
      fromMix,
      toMix,
      now,
    );
    this.mode = mode;
    this.modeTransition = { fromMix, startTime: now, toMix };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.sourceNode.stop();
    } catch {
      // A browser can reject stop after a failed or already-ended source.
    }
    for (const node of [
      this.sourceNode,
      this.sourceGain,
      this.distanceGain,
      this.panner,
      this.rawModeGain,
      this.simulatedModeGain,
    ]) {
      try {
        node.disconnect();
      } catch {
        // Disconnect is best-effort during terminal cleanup.
      }
    }
  }

  private initializeParameters(
    source: SceneSource,
    listener: SceneListener,
    mode: PreviewMode,
  ): void {
    const distanceM = Math.hypot(
      source.position.x - listener.position.x,
      source.position.y - listener.position.y,
    );
    const coefficients = equalPowerCrossfade(mode === "simulated" ? 1 : 0);
    this.sourceGain.gain.value = dbToLinear(source.gainDb);
    this.distanceGain.gain.value = distanceAttenuation(distanceM);
    this.panner.positionX.value = source.position.x - listener.position.x;
    this.panner.positionY.value = 0;
    this.panner.positionZ.value = -(source.position.y - listener.position.y);
    this.rawModeGain.gain.value = coefficients.raw;
    this.simulatedModeGain.gain.value = coefficients.simulated;
  }

  private currentModeMix(now: number): number {
    const transition = this.modeTransition;
    if (!transition) return this.mode === "simulated" ? 1 : 0;
    const progress = Math.min(
      1,
      Math.max(0, (now - transition.startTime) / MODE_CROSSFADE_SECONDS),
    );
    return transition.fromMix + (transition.toMix - transition.fromMix) * progress;
  }
}
