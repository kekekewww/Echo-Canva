import { dbToLinear } from "@/audio/math";
import { smoothParameter } from "@/audio/parameter-smoothing";
import type {
  AudioContextLike,
  AudioNodeLike,
  BiquadFilterNodeLike,
  DelayNodeLike,
  GainNodeLike,
  PannerNodeLike,
} from "@/audio/types";
import type { AcousticEarlyReflection } from "@/acoustics/compute-frame";
import type { Vec2 } from "@/domain/scene/types";

export const MAX_EARLY_REFLECTION_TAPS = 6;
const MAX_EARLY_DELAY_SECONDS = 0.2;

type ReflectionTapNodes = Readonly<{
  delay: DelayNodeLike;
  gain: GainNodeLike;
  filter: BiquadFilterNodeLike;
  panner: PannerNodeLike;
}>;

/** A fixed, simulated-only pool for first-order early-reflection taps. */
export class EarlyReflectionBank {
  private readonly taps: readonly ReflectionTapNodes[];
  private disposed = false;

  constructor(
    context: AudioContextLike,
    input: AudioNodeLike,
    output: AudioNodeLike,
    private readonly listenerPosition: () => Vec2,
    hrtfEnabled: boolean,
  ) {
    this.taps = Array.from({ length: MAX_EARLY_REFLECTION_TAPS }, () => {
      const delay = context.createDelay(MAX_EARLY_DELAY_SECONDS);
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const panner = context.createPanner();
      filter.type = "lowpass";
      filter.frequency.value = 20_000;
      gain.gain.value = 0;
      panner.panningModel = hrtfEnabled ? "HRTF" : "equalpower";
      panner.distanceModel = "inverse";
      panner.rolloffFactor = 0;
      panner.refDistance = 1;
      panner.maxDistance = 50;
      input.connect(delay);
      delay.connect(gain);
      gain.connect(filter);
      filter.connect(panner);
      panner.connect(output);
      return { delay, gain, filter, panner };
    });
  }

  apply(reflections: readonly AcousticEarlyReflection[], now: number): void {
    if (this.disposed) return;
    const listener = this.listenerPosition();
    for (let index = 0; index < this.taps.length; index += 1) {
      const nodes = this.taps[index]!;
      const reflection = reflections[index];
      if (!reflection) {
        smoothParameter(nodes.gain.gain, 0, now);
        continue;
      }
      smoothParameter(
        nodes.delay.delayTime,
        clampDelaySeconds(reflection.delayMs / 1000),
        now,
      );
      smoothParameter(nodes.gain.gain, dbToLinear(reflection.gainDb), now);
      smoothParameter(nodes.filter.frequency, clampFrequency(reflection.lowpassHz), now);
      smoothParameter(nodes.panner.positionX, reflection.reflectionPoint.x - listener.x, now);
      smoothParameter(nodes.panner.positionY, 0, now);
      smoothParameter(nodes.panner.positionZ, -(reflection.reflectionPoint.y - listener.y), now);
    }
  }

  setHrtfEnabled(enabled: boolean): void {
    if (this.disposed) return;
    for (const tap of this.taps) tap.panner.panningModel = enabled ? "HRTF" : "equalpower";
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const tap of this.taps) {
      for (const node of [tap.delay, tap.gain, tap.filter, tap.panner]) {
        try {
          node.disconnect();
        } catch {
          // Terminal cleanup is best-effort for browser nodes.
        }
      }
    }
  }
}

function clampDelaySeconds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_EARLY_DELAY_SECONDS, Math.max(0, value));
}

function clampFrequency(value: number): number {
  if (!Number.isFinite(value)) return 20_000;
  return Math.min(20_000, Math.max(80, value));
}
