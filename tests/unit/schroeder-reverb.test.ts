import { describe, expect, it } from "vitest";

import {
  SchroederReverb,
  dampingCutoffHz,
  feedbackGainForRt60,
} from "@/audio/SchroederReverb";
import type { AudioNodeLike, AudioParamLike } from "@/audio/types";

type Connection = Readonly<{ destination: AudioNodeLike; output?: number; input?: number }>;

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
  readonly connections: Connection[] = [];
  disconnectCalls = 0;
  connect(destination: AudioNodeLike, output?: number, input?: number): AudioNodeLike {
    this.connections.push({ destination, output, input });
    return destination;
  }
  disconnect(): void { this.disconnectCalls += 1; }
}

type FakeGain = FakeNode & { gain: FakeParam };
type FakeDelay = FakeNode & { delayTime: FakeParam };
type FakeFilter = FakeNode & { frequency: FakeParam; type: BiquadFilterType };

class FakeContext {
  readonly allNodes: FakeNode[] = [];
  readonly delays: FakeDelay[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  readonly splitters: FakeNode[] = [];
  readonly mergers: FakeNode[] = [];
  failOnCreation: number | null = null;
  private creationCount = 0;

  createDelay() { const node = this.track(Object.assign(new FakeNode(), { delayTime: new FakeParam() })); this.delays.push(node); return node; }
  createGain() { const node = this.track(Object.assign(new FakeNode(), { gain: new FakeParam(1) })); this.gains.push(node); return node; }
  createBiquadFilter() {
    const node = this.track(Object.assign(new FakeNode(), { frequency: new FakeParam(20_000), type: "lowpass" as BiquadFilterType }));
    this.filters.push(node);
    return node;
  }
  createChannelSplitter() { const node = this.track(new FakeNode()); this.splitters.push(node); return node; }
  createChannelMerger() { const node = this.track(new FakeNode()); this.mergers.push(node); return node; }

  private track<T extends FakeNode>(node: T): T {
    this.creationCount += 1;
    if (this.creationCount === this.failOnCreation) throw new Error("Injected node factory failure.");
    this.allNodes.push(node);
    return node;
  }
}

const room = { volumeM3: 80, totalSurfaceM2: 150, rt60S: { low: 1.8, mid: 1.4, high: 0.5 }, preDelayMs: 28 };

function destinations(node: FakeNode): FakeNode[] {
  return node.connections.map(({ destination }) => destination as FakeNode);
}

function isDelay(node: FakeNode): node is FakeDelay {
  return "delayTime" in node;
}

function isGain(node: FakeNode): node is FakeGain {
  return "gain" in node;
}

function assertAllPassStage(input: FakeNode): FakeNode {
  const stageDelay = destinations(input).find(isDelay);
  const feedForward = destinations(input).find((node): node is FakeGain => isGain(node) && node.gain.value < 0);
  expect(stageDelay).toBeDefined();
  expect(feedForward?.gain.value).toBeCloseTo(-0.5);

  const feedback = destinations(stageDelay!).find(
    (node): node is FakeGain => isGain(node) && Math.abs(node.gain.value - 0.5) < 1e-8 && destinations(node).includes(stageDelay!),
  );
  const bypass = destinations(stageDelay!).find(
    (node): node is FakeGain => isGain(node) && Math.abs(node.gain.value - 0.75) < 1e-8,
  );
  expect(feedback).toBeDefined();
  expect(bypass).toBeDefined();

  const mix = destinations(feedForward!)[0];
  expect(mix).toBeDefined();
  expect(destinations(bypass!)).toContain(mix);
  return mix!;
}

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

  it("builds two true all-pass diffusers with feedback, polarity, and bypass branches", () => {
    const context = new FakeContext();
    new SchroederReverb(context as never, new FakeNode());

    const firstInput = destinations(context.mergers[0]!)[0]!;
    const firstMix = assertAllPassStage(firstInput);
    const secondInput = destinations(firstMix)[0]!;
    assertAllPassStage(secondInput);
  });

  it("smooths pre-delay, comb feedback, and high-band damping without allocating nodes", () => {
    const context = new FakeContext();
    const reverb = new SchroederReverb(context as never, new FakeNode());
    const nodeCounts = [context.delays.length, context.gains.length, context.filters.length, context.splitters.length, context.mergers.length];

    reverb.apply(room, 2);
    reverb.apply({ ...room, rt60S: { low: 0.4, mid: 0.7, high: 0.2 } }, 2.1);

    expect(context.delays).toHaveLength(7);
    expect(context.filters).toHaveLength(4);
    expect(context.splitters).toHaveLength(1);
    expect(context.mergers).toHaveLength(1);
    expect([context.delays.length, context.gains.length, context.filters.length, context.splitters.length, context.mergers.length])
      .toEqual(nodeCounts);
    expect(context.delays.some((delay) => delay.delayTime.targets.some(({ target }) => target === 0.028))).toBe(true);
    expect(context.filters.every((filter) => filter.frequency.targets.at(-1)?.target === dampingCutoffHz({ low: 0.4, mid: 0.7, high: 0.2 }))).toBe(true);
    expect(context.gains.some((gain) => gain.gain.targets.some(({ target }) => target === 10 ** (-3 * 0.0297 / 1.4)))).toBe(true);
    expect(context.delays.flatMap((delay) => delay.delayTime.targets).every(({ timeConstant }) => timeConstant === 0.08)).toBe(true);
  });

  it("rolls back partial native-node allocation", () => {
    const context = new FakeContext();
    context.failOnCreation = 6;

    expect(() => new SchroederReverb(context as never, new FakeNode())).toThrow(/factory failure/i);
    expect(context.allNodes).not.toHaveLength(0);
    expect(context.allNodes.every((node) => node.disconnectCalls === 1)).toBe(true);
  });

  it("disconnects every owned node exactly once on disposal", () => {
    const context = new FakeContext();
    const reverb = new SchroederReverb(context as never, new FakeNode());

    reverb.dispose();
    reverb.dispose();

    expect(context.allNodes.every((node) => node.disconnectCalls === 1)).toBe(true);
  });
});
