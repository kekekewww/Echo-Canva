import { dbToLinear, distanceAttenuation, equalPowerCrossfade } from "@/audio/math";
import {
  MODE_CROSSFADE_SECONDS,
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
  private disposed = false;

  constructor(
    context: AudioContextLike,
    output: AudioNodeLike,
    source: SceneSource,
    buffer: AudioBufferLike,
    mode: PreviewMode,
  ) {
    this.sourceId = source.id;
    this.sourceNode = context.createBufferSource();
    this.sourceGain = context.createGain();
    this.distanceGain = context.createGain();
    this.rawModeGain = context.createGain();
    this.simulatedModeGain = context.createGain();
    this.panner = context.createPanner();

    this.panner.panningModel = "HRTF";
    this.panner.distanceModel = "inverse";
    this.panner.refDistance = 1;
    this.panner.maxDistance = 50;
    this.panner.rolloffFactor = 0;

    this.sourceNode.buffer = buffer;
    this.sourceNode.loop = source.loop;
    this.sourceNode.connect(this.sourceGain);
    this.sourceGain.connect(this.rawModeGain);
    this.rawModeGain.connect(output);
    this.sourceGain.connect(this.distanceGain);
    this.distanceGain.connect(this.panner);
    this.panner.connect(this.simulatedModeGain);
    this.simulatedModeGain.connect(output);

    this.applyMode(mode, context.currentTime);
    this.sourceNode.start();
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
    const coefficients = equalPowerCrossfade(mode === "simulated" ? 1 : 0);
    smoothParameter(this.rawModeGain.gain, coefficients.raw, now, MODE_CROSSFADE_SECONDS);
    smoothParameter(
      this.simulatedModeGain.gain,
      coefficients.simulated,
      now,
      MODE_CROSSFADE_SECONDS,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sourceNode.stop();
    this.sourceNode.disconnect();
    this.sourceGain.disconnect();
    this.distanceGain.disconnect();
    this.panner.disconnect();
    this.rawModeGain.disconnect();
    this.simulatedModeGain.disconnect();
  }
}
