import { describe, expect, it } from "vitest";

import { EarlyReflectionBank } from "@/audio/EarlyReflectionBank";
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
  readonly connections: AudioNodeLike[] = [];
  disconnectCalls = 0;

  connect(destination: AudioNodeLike): AudioNodeLike {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void { this.disconnectCalls += 1; }
}

class FakeContext {
  readonly allNodes: FakeNode[] = [];
  readonly delays: Array<FakeNode & { delayTime: FakeParam }> = [];
  readonly gains: Array<FakeNode & { gain: FakeParam }> = [];
  readonly filters: Array<FakeNode & { frequency: FakeParam; type: BiquadFilterType }> = [];
  readonly panners: Array<FakeNode & {
    positionX: FakeParam;
    positionY: FakeParam;
    positionZ: FakeParam;
    panningModel: PanningModelType;
    distanceModel: DistanceModelType;
    rolloffFactor: number;
    refDistance: number;
    maxDistance: number;
  }> = [];
  failOnCreation: number | null = null;
  private creationCount = 0;

  createDelay() {
    const node = this.track(Object.assign(new FakeNode(), { delayTime: new FakeParam() }));
    this.delays.push(node);
    return node;
  }

  createGain() {
    const node = this.track(Object.assign(new FakeNode(), { gain: new FakeParam(1) }));
    this.gains.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = this.track(Object.assign(new FakeNode(), { frequency: new FakeParam(20_000), type: "lowpass" as BiquadFilterType }));
    this.filters.push(node);
    return node;
  }

  createPanner() {
    const node = this.track(Object.assign(new FakeNode(), {
      positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam(),
      panningModel: "equalpower" as PanningModelType, distanceModel: "inverse" as DistanceModelType,
      rolloffFactor: 1, refDistance: 1, maxDistance: 10_000,
    }));
    this.panners.push(node);
    return node;
  }

  private track<T extends FakeNode>(node: T): T {
    this.creationCount += 1;
    if (this.creationCount === this.failOnCreation) throw new Error("Injected node factory failure.");
    this.allNodes.push(node);
    return node;
  }
}

const listener = { x: 4, y: 3 };
const tap = (index: number) => ({
  wallId: `wall-${index}`,
  reflectionPoint: { x: 8 + index, y: 2 },
  pathLengthM: 8,
  delayMs: 15 + index,
  gainDb: -9 - index,
  lowpassHz: 4_000 - index * 100,
});

describe("EarlyReflectionBank", () => {
  it("creates a fixed six-tap pool once and ignores extra reflection taps", () => {
    const context = new FakeContext();
    const bank = new EarlyReflectionBank(context as never, new FakeNode(), new FakeNode(), () => listener, true);

    bank.apply(Array.from({ length: 8 }, (_, index) => tap(index)), 3);

    expect(context.delays).toHaveLength(6);
    expect(context.gains).toHaveLength(6);
    expect(context.filters).toHaveLength(6);
    expect(context.panners).toHaveLength(6);
    expect(context.gains[5]?.gain.targets.at(-1)?.target).toBeCloseTo(10 ** (-14 / 20));
    expect(context.gains.some((gain) => gain.gain.targets.some(({ target }) => target === 10 ** (-15 / 20)))).toBe(false);
  });

  it("ramps inactive taps to silence without allocating nodes during frame updates", () => {
    const context = new FakeContext();
    const bank = new EarlyReflectionBank(context as never, new FakeNode(), new FakeNode(), () => listener, true);
    bank.apply([tap(0), tap(1)], 3);
    const nodeCounts = [context.delays.length, context.gains.length, context.filters.length, context.panners.length];

    bank.apply([tap(0)], 3.1);

    expect(context.gains.slice(1).every((gain) => gain.gain.targets.at(-1)?.target === 0)).toBe(true);
    expect([context.delays.length, context.gains.length, context.filters.length, context.panners.length])
      .toEqual(nodeCounts);
  });

  it("maps a 3D reflection point to the persistent tap panner and silences removed taps", () => {
    const context = new FakeContext();
    const bank = new EarlyReflectionBank(context as never, new FakeNode(), new FakeNode(), () => listener, true);
    const nodeCounts = [context.delays.length, context.gains.length, context.filters.length, context.panners.length];

    bank.applySpatial3d([{
      id: "first:ceiling",
      position: { x: 8, y: 3, z: 5 },
      delayMs: 18,
      gainDb: -14,
      lowpassHz: 6_000,
    }], { x: 4, y: 1, z: 2 }, 3);

    expect(context.delays[0]?.delayTime.targets.at(-1)?.target).toBeCloseTo(0.018);
    expect(context.gains[0]?.gain.targets.at(-1)?.target).toBeCloseTo(10 ** (-14 / 20));
    expect(context.filters[0]?.frequency.targets.at(-1)?.target).toBe(6_000);
    expect(context.panners[0]?.positionX.targets.at(-1)?.target).toBe(4);
    expect(context.panners[0]?.positionY.targets.at(-1)?.target).toBe(2);
    expect(context.panners[0]?.positionZ.targets.at(-1)?.target).toBe(-3);

    bank.applySpatial3d([], { x: 4, y: 1, z: 2 }, 3.1);
    expect(context.gains.every((gain) => gain.gain.targets.at(-1)?.target === 0)).toBe(true);
    expect([context.delays.length, context.gains.length, context.filters.length, context.panners.length])
      .toEqual(nodeCounts);
  });

  it("rolls back partial tap allocation and disconnects all owned nodes on disposal", () => {
    const failed = new FakeContext();
    failed.failOnCreation = 6;

    expect(() => new EarlyReflectionBank(failed as never, new FakeNode(), new FakeNode(), () => listener, true))
      .toThrow(/factory failure/i);
    expect(failed.allNodes).not.toHaveLength(0);
    expect(failed.allNodes.every((node) => node.disconnectCalls === 1)).toBe(true);

    const context = new FakeContext();
    const bank = new EarlyReflectionBank(context as never, new FakeNode(), new FakeNode(), () => listener, true);
    bank.dispose();
    bank.dispose();
    expect(context.allNodes.every((node) => node.disconnectCalls === 1)).toBe(true);
  });
});
