import { dbToLinear, distanceAttenuation, equalPowerCrossfade } from "@/audio/math";
import {
  MODE_CROSSFADE_SECONDS,
  scheduleEqualPowerCrossfade,
  smoothParameter,
} from "@/audio/parameter-smoothing";
import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  BiquadFilterNodeLike,
  AudioContextLike,
  AudioNodeLike,
  GainNodeLike,
  PannerNodeLike,
} from "@/audio/types";
import type { PreviewMode } from "@/domain/editor/state";
import type { SceneSpec } from "@/domain/scene/types";
import type { AcousticFrameSource } from "@/acoustics/compute-frame";

let nextGraphIdentity = 1;
const HALF_PI = Math.PI * 0.5;

type SceneSource = SceneSpec["sources"][number];
type SceneListener = SceneSpec["listener"];

export class SourceGraph {
  readonly identity = nextGraphIdentity++;
  readonly sourceId: string;
  private readonly sourceNode: AudioBufferSourceNodeLike;
  private readonly sourceGain: GainNodeLike;
  private readonly distanceGain: GainNodeLike;
  private readonly lowPass: BiquadFilterNodeLike;
  private readonly rawModeGain: GainNodeLike;
  private readonly simulatedModeGain: GainNodeLike;
  private readonly panner: PannerNodeLike;
  private readonly clipId: string;
  private readonly loop: boolean;
  private mode: PreviewMode;
  private modeTransition: Readonly<{
    fromAngleRad: number;
    startTime: number;
    toAngleRad: number;
  }> | null = null;
  private disposed = false;

  constructor(
    context: AudioContextLike,
    output: AudioNodeLike,
    source: SceneSource,
    listener: SceneListener,
    buffer: AudioBufferLike,
    mode: PreviewMode,
    hrtfEnabled: boolean,
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
      const lowPass = context.createBiquadFilter();
      createdNodes.push(lowPass);
      const rawModeGain = context.createGain();
      createdNodes.push(rawModeGain);
      const simulatedModeGain = context.createGain();
      createdNodes.push(simulatedModeGain);
      const panner = context.createPanner();
      createdNodes.push(panner);

      this.sourceNode = sourceNode;
      this.sourceGain = sourceGain;
      this.distanceGain = distanceGain;
      this.lowPass = lowPass;
      this.rawModeGain = rawModeGain;
      this.simulatedModeGain = simulatedModeGain;
      this.panner = panner;

      panner.panningModel = hrtfEnabled ? "HRTF" : "equalpower";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.maxDistance = 50;
      panner.rolloffFactor = 0;
      lowPass.type = "lowpass";
      lowPass.frequency.value = 20_000;

      sourceNode.buffer = buffer;
      sourceNode.loop = source.loop;
      sourceNode.connect(sourceGain);
      sourceGain.connect(rawModeGain);
      rawModeGain.connect(output);
      sourceGain.connect(distanceGain);
      distanceGain.connect(lowPass);
      lowPass.connect(panner);
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

  apply(
    source: SceneSource,
    listener: SceneListener,
    now: number,
    hrtfEnabled: boolean,
    applySimulatedFallback: boolean,
  ): void {
    smoothParameter(this.sourceGain.gain, dbToLinear(source.gainDb), now);
    this.panner.panningModel = hrtfEnabled ? "HRTF" : "equalpower";
    if (!applySimulatedFallback) return;

    const distanceM = Math.hypot(
      source.position.x - listener.position.x,
      source.position.y - listener.position.y,
    );
    smoothParameter(this.distanceGain.gain, distanceAttenuation(distanceM), now);
    smoothParameter(this.panner.positionX, source.position.x - listener.position.x, now);
    smoothParameter(this.panner.positionY, 0, now);
    smoothParameter(this.panner.positionZ, -(source.position.y - listener.position.y), now);
  }

  applyMode(mode: PreviewMode, now: number): void {
    if (this.disposed || mode === this.mode) return;
    const toAngleRad = mode === "simulated" ? HALF_PI : 0;
    const fromAngleRad = this.currentModeAngle(now);
    scheduleEqualPowerCrossfade(
      this.rawModeGain.gain,
      this.simulatedModeGain.gain,
      fromAngleRad,
      toAngleRad,
      now,
    );
    this.mode = mode;
    this.modeTransition = { fromAngleRad, startTime: now, toAngleRad };
  }

  applyFrame(sourceFrame: AcousticFrameSource, listener: SceneListener, now: number): void {
    if (this.disposed) return;
    smoothParameter(
      this.distanceGain.gain,
      dbToLinear(sourceFrame.dryGainDb) * distanceAttenuation(sourceFrame.effectiveDistanceM),
      now,
    );
    smoothParameter(this.lowPass.frequency, sourceFrame.lowpassHz, now);
    smoothParameter(
      this.panner.positionX,
      sourceFrame.virtualPosition.x - listener.position.x,
      now,
    );
    smoothParameter(this.panner.positionY, 0, now);
    smoothParameter(
      this.panner.positionZ,
      -(sourceFrame.virtualPosition.y - listener.position.y),
      now,
    );
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
      this.lowPass,
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

  private currentModeAngle(now: number): number {
    const transition = this.modeTransition;
    if (!transition) return this.mode === "simulated" ? HALF_PI : 0;
    const progress = Math.min(
      1,
      Math.max(0, (now - transition.startTime) / MODE_CROSSFADE_SECONDS),
    );
    return transition.fromAngleRad +
      (transition.toAngleRad - transition.fromAngleRad) * progress;
  }
}
