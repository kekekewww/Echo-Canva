import { describe, expect, it } from "vitest";

import {
  SchroederReverb,
  dampingCutoffHz,
  feedbackGainForRt60,
} from "@/audio/SchroederReverb";
import type { AudioNodeLike, AudioParamLike } from "@/audio/types";

class FakeParam implements AudioParamLike {
  readonly targets: Array<{ target: number; startTime: number; timeConstant: number }> = [];
  constructor(readonly value = 0) {}
  cancelAndHoldAtTime(): AudioParamLike { return this; }
  cancelScheduledValues(): AudioParamLike { return this; }
  setValueCurveAtTime(): AudioParamLike { return this; }
  setTargetAtTime(target: number, startTime: number, timeConstant: number): AudioParamLike {
    this.targets.push({ target, startTime, timeConstant });
    return this;
  }
}

class FakeNode implements AudioNodeLike {
  disconnectCalls = 0;
  connect(destination: AudioNodeLike): AudioNodeLike { return destination; }
  disconnect(): void { this.disconnectCalls += 1; }
}

class FakeContext {
  readonly delays: Array<FakeNode & { delayTime: FakeParam }> = [];
  readonly gains: Array<FakeNode & { gain: FakeParam }> = [];
  readonly filters: Array<FakeNode & { frequency: FakeParam; type: BiquadFilterType }> = [];
  readonly splitters: FakeNode[] = [];
  readonly mergers: FakeNode[] = [];

  createDelay() { const node = Object.assign(new FakeNode(), { delayTime: new FakeParam() }); this.delays.push(node); return node; }
  createGain() { const node = Object.assign(new FakeNode(), { gain: new FakeParam(1) }); this.gains.push(node); return node; }
  createBiquadFilter() {
    const node = Object.assign(new FakeNode(), { frequency: new FakeParam(20_000), type: "lowpass" as BiquadFilterType });
    this.filters.push(node);
    return node;
  }
  createChannelSplitter() { const node = new FakeNode(); this.splitters.push(node); return node; }
  createChannelMerger() { const node = new FakeNode(); this.mergers.push(node); return node; }
}

const room = { volumeM3: 80, totalSurfaceM2: 150, rt60S: { low: 1.8, mid: 1.4, high: 0.5 }, preDelayMs: 28 };

describe("SchroederReverb", () => {
  it("derives finite comb feedback from the target mid-band RT60 and clamps unsafe values", () => {
    expect(feedbackGainForRt60(0.0371, 1.4)).toBeCloseTo(10 ** (-3 * 0.0371 / 1.4));
    expect(feedbackGainForRt60(0.0371, 0)).toBeGreaterThan(0);
    expect(feedbackGainForRt60(0.0371, Number.NaN)).toBeLessThan(1);
  });

  it("lowers the damping cutoff when high-band RT60 is shorter than the mid band", () => {
    expect(dampingCutoffHz({ low: 1.4, mid: 1.4, high: 0.35 }))
      .toBeLessThan(dampingCutoffHz({ low: 1.4, mid: 1.4, high: 1.4 }));
  });

  it("keeps its four-comb/two-all-pass native-node graph persistent across updates", () => {
    const context = new FakeContext();
    const reverb = new SchroederReverb(context as never, new FakeNode());
    const nodeCounts = [context.delays.length, context.gains.length, context.filters.length];

    reverb.apply(room, 2);
    reverb.apply({ ...room, rt60S: { low: 0.4, mid: 0.7, high: 0.2 } }, 2.1);

    expect(context.delays).toHaveLength(7);
    expect(context.filters).toHaveLength(4);
    expect(context.splitters).toHaveLength(1);
    expect(context.mergers).toHaveLength(1);
    expect([context.delays.length, context.gains.length, context.filters.length]).toEqual(nodeCounts);
    expect(context.gains.some((gain) => gain.gain.targets.some(({ target }) => target === 10 ** (-3 * 0.0297 / 1.4)))).toBe(true);
  });
});
