import { clampFinite } from "@/audio/math";
import { smoothParameter } from "@/audio/parameter-smoothing";
import type {
  AudioContextLike,
  ChannelMergerNodeLike,
  ChannelSplitterNodeLike,
  AudioNodeLike,
  BiquadFilterNodeLike,
  DelayNodeLike,
  GainNodeLike,
} from "@/audio/types";
import type { RoomAcousticFrame } from "@/acoustics/types";
import type { Band3 } from "@/domain/scene/types";

const COMB_DELAYS_SECONDS = [0.0297, 0.0371, 0.0411, 0.0437] as const;
const ALL_PASS_DELAYS_SECONDS = [0.005, 0.0017] as const;
const MIN_RT60_SECONDS = 0.12;
const MAX_RT60_SECONDS = 4;
const MASTER_SAFE_WET_GAIN = 0.28;

type CombNodes = Readonly<{
  delay: DelayNodeLike;
  damping: BiquadFilterNodeLike;
  feedback: GainNodeLike;
  output: GainNodeLike;
}>;

type AllPassNodes = Readonly<{
  delay: DelayNodeLike;
  feedback: GainNodeLike;
}>;

export function feedbackGainForRt60(delaySeconds: number, rt60MidSeconds: number): number {
  const delay = clampFinite(delaySeconds, 0.0001, 0.2, 0.03);
  const rt60 = clampFinite(rt60MidSeconds, MIN_RT60_SECONDS, MAX_RT60_SECONDS, 0.8);
  return 10 ** (-3 * delay / rt60);
}

export function dampingCutoffHz(rt60S: Band3): number {
  const mid = clampFinite(rt60S.mid, MIN_RT60_SECONDS, MAX_RT60_SECONDS, 0.8);
  const high = clampFinite(rt60S.high, MIN_RT60_SECONDS, MAX_RT60_SECONDS, mid);
  const highToMidRatio = clampFinite(high / mid, 0.05, 1, 1);
  return 700 * (20_000 / 700) ** highToMidRatio;
}

/** Persistent native-node Schroeder late-reverb network for the simulated return. */
export class SchroederReverb {
  readonly input: AudioNodeLike;
  private readonly preDelay: DelayNodeLike;
  private readonly splitter: ChannelSplitterNodeLike;
  private readonly merger: ChannelMergerNodeLike;
  private readonly combs: readonly CombNodes[];
  private readonly allPasses: readonly AllPassNodes[];
  private readonly wetReturn: GainNodeLike;
  private readonly nodes: readonly AudioNodeLike[];
  private disposed = false;

  constructor(context: AudioContextLike, output: AudioNodeLike) {
    const preDelay = context.createDelay(0.1);
    const splitter = context.createChannelSplitter(2);
    const merger = context.createChannelMerger(2);
    const combs = COMB_DELAYS_SECONDS.map((delaySeconds) => {
      const delay = context.createDelay(0.1);
      const damping = context.createBiquadFilter();
      const feedback = context.createGain();
      const combOutput = context.createGain();
      delay.delayTime.value = delaySeconds;
      damping.type = "lowpass";
      damping.frequency.value = 20_000;
      feedback.gain.value = feedbackGainForRt60(delaySeconds, 0.8);
      delay.connect(damping);
      damping.connect(feedback);
      feedback.connect(delay);
      damping.connect(combOutput);
      return { delay, damping, feedback, output: combOutput };
    });
    const allPasses = ALL_PASS_DELAYS_SECONDS.map((delaySeconds) => {
      const delay = context.createDelay(0.1);
      const feedback = context.createGain();
      delay.delayTime.value = delaySeconds;
      feedback.gain.value = 0.5;
      delay.connect(feedback);
      feedback.connect(delay);
      return { delay, feedback };
    });
    const wetReturn = context.createGain();
    wetReturn.gain.value = MASTER_SAFE_WET_GAIN;

    preDelay.connect(splitter);
    for (let index = 0; index < combs.length; index += 1) {
      const comb = combs[index]!;
      splitter.connect(comb.delay, index % 2);
      comb.output.connect(merger, 0, index % 2);
    }
    merger.connect(allPasses[0]!.delay);
    allPasses[0]!.delay.connect(allPasses[1]!.delay);
    allPasses[1]!.delay.connect(wetReturn);
    wetReturn.connect(output);

    this.input = preDelay;
    this.preDelay = preDelay;
    this.splitter = splitter;
    this.merger = merger;
    this.combs = combs;
    this.allPasses = allPasses;
    this.wetReturn = wetReturn;
    this.nodes = [
      preDelay,
      splitter,
      ...combs.flatMap((comb) => [comb.delay, comb.damping, comb.feedback, comb.output]),
      ...allPasses.flatMap((allPass) => [allPass.delay, allPass.feedback]),
      merger,
      wetReturn,
    ];
  }

  apply(room: RoomAcousticFrame, now: number): void {
    if (this.disposed) return;
    const rt60Mid = clampFinite(room.rt60S.mid, MIN_RT60_SECONDS, MAX_RT60_SECONDS, 0.8);
    smoothParameter(this.preDelay.delayTime, clampPreDelay(room.preDelayMs), now);
    const damping = dampingCutoffHz(room.rt60S);
    for (let index = 0; index < this.combs.length; index += 1) {
      const comb = this.combs[index]!;
      smoothParameter(comb.feedback.gain, feedbackGainForRt60(COMB_DELAYS_SECONDS[index]!, rt60Mid), now);
      smoothParameter(comb.damping.frequency, damping, now);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const node of this.nodes) {
      try {
        node.disconnect();
      } catch {
        // Terminal cleanup is best-effort for browser nodes.
      }
    }
  }
}

function clampPreDelay(preDelayMs: number): number {
  return clampFinite(preDelayMs / 1000, 0.005, 0.08, 0.02);
}
