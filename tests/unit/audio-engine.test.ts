import { describe, expect, it } from "vitest";

import { AudioEngine } from "@/audio/AudioEngine";
import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioListenerLike,
  AudioNodeLike,
  AudioParamLike,
  DynamicsCompressorNodeLike,
  GainNodeLike,
  PannerNodeLike,
} from "@/audio/types";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import type { SceneSpec } from "@/domain/scene/types";

class FakeParam implements AudioParamLike {
  value = 0;
  readonly targets: Array<{ target: number; startTime: number; timeConstant: number }> = [];

  setTargetAtTime(target: number, startTime: number, timeConstant: number): AudioParamLike {
    this.value = target;
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

  disconnect(): void {
    this.disconnectCalls += 1;
    this.connections.length = 0;
  }
}

class FakeGainNode extends FakeNode implements GainNodeLike {
  readonly gain = new FakeParam();
}

class FakePannerNode extends FakeNode implements PannerNodeLike {
  panningModel: PanningModelType = "equalpower";
  distanceModel: DistanceModelType = "inverse";
  rolloffFactor = 1;
  refDistance = 1;
  maxDistance = 10_000;
  readonly positionX = new FakeParam();
  readonly positionY = new FakeParam();
  readonly positionZ = new FakeParam();
}

class FakeBufferSourceNode extends FakeNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  startCalls = 0;
  stopCalls = 0;

  start(): void {
    this.startCalls += 1;
  }

  stop(): void {
    this.stopCalls += 1;
  }
}

class FakeCompressorNode extends FakeNode implements DynamicsCompressorNodeLike {}

class FakeListener implements AudioListenerLike {
  readonly positionX = new FakeParam();
  readonly positionY = new FakeParam();
  readonly positionZ = new FakeParam();
  readonly forwardX = new FakeParam();
  readonly forwardY = new FakeParam();
  readonly forwardZ = new FakeParam();
  readonly upX = new FakeParam();
  readonly upY = new FakeParam();
  readonly upZ = new FakeParam();
}

class FakeAudioContext implements AudioContextLike {
  currentTime = 4;
  state: AudioContextState = "suspended";
  readonly destination = new FakeNode();
  readonly listener = new FakeListener();
  readonly gains: FakeGainNode[] = [];
  readonly panners: FakePannerNode[] = [];
  readonly sources: FakeBufferSourceNode[] = [];
  readonly compressors: FakeCompressorNode[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  decodeCalls = 0;

  createGain(): GainNodeLike {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createPanner(): PannerNodeLike {
    const node = new FakePannerNode();
    this.panners.push(node);
    return node;
  }

  createBufferSource(): AudioBufferSourceNodeLike {
    const node = new FakeBufferSourceNode();
    this.sources.push(node);
    return node;
  }

  createDynamicsCompressor(): DynamicsCompressorNodeLike {
    const node = new FakeCompressorNode();
    this.compressors.push(node);
    return node;
  }

  async decodeAudioData(): Promise<AudioBufferLike> {
    this.decodeCalls += 1;
    return { numberOfChannels: 1 };
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
  }

  async suspend(): Promise<void> {
    this.suspendCalls += 1;
    this.state = "suspended";
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = "closed";
  }
}

function cloneScene(): SceneSpec {
  return structuredClone(CONCRETE_PARTITION_PRESET);
}

function makeHarness() {
  const context = new FakeAudioContext();
  let contextCreations = 0;
  const requestedUrls: string[] = [];
  const engine = new AudioEngine({
    createContext: () => {
      contextCreations += 1;
      return context;
    },
    fetchArrayBuffer: async (url) => {
      requestedUrls.push(url);
      return new ArrayBuffer(16);
    },
  });
  return { context, engine, requestedUrls, contextCreations: () => contextCreations };
}

describe("AudioEngine", () => {
  it("is lazy until explicit start and creates one persistent HRTF graph per source", async () => {
    const harness = makeHarness();
    const scene = cloneScene();

    expect(harness.contextCreations()).toBe(0);
    expect(harness.engine.getDiagnostics().status).toBe("idle");

    await harness.engine.start(scene);

    expect(harness.contextCreations()).toBe(1);
    expect(harness.context.resumeCalls).toBe(1);
    expect(harness.context.sources).toHaveLength(scene.sources.length);
    expect(harness.context.sources.every((source) => source.startCalls === 1)).toBe(true);
    expect(harness.context.panners.every((panner) => panner.panningModel === "HRTF")).toBe(true);
    expect(harness.context.panners.every((panner) => panner.rolloffFactor === 0)).toBe(true);
    expect(harness.context.compressors).toHaveLength(1);
    expect(harness.requestedUrls.every((url) => url.startsWith("/audio/"))).toBe(true);
  });

  it("makes repeated start idempotent and keeps graph identity stable after movement", async () => {
    const harness = makeHarness();
    const scene = cloneScene();
    await harness.engine.start(scene);
    const before = harness.engine.getDiagnostics();

    await harness.engine.start(scene);
    const moved = cloneScene();
    moved.sources[0]!.position.x += 2;
    moved.listener.position.y -= 1;
    await harness.engine.applyScene(moved);
    const after = harness.engine.getDiagnostics();

    expect(harness.contextCreations()).toBe(1);
    expect(harness.context.sources).toHaveLength(scene.sources.length);
    expect(harness.context.sources.every((source) => source.startCalls === 1)).toBe(true);
    expect(after.sourceGraphIds).toEqual(before.sourceGraphIds);
    expect(after.applyCount).toBe(before.applyCount + 1);
  });

  it("coalesces concurrent start requests without duplicating source nodes", async () => {
    const harness = makeHarness();
    const scene = cloneScene();

    await Promise.all([harness.engine.start(scene), harness.engine.start(scene)]);

    expect(harness.contextCreations()).toBe(1);
    expect(harness.context.sources).toHaveLength(scene.sources.length);
    expect(harness.engine.getDiagnostics().sourceStarts).toBe(scene.sources.length);
  });

  it("smooths source gain, manual distance, relative panner position, and listener orientation", async () => {
    const harness = makeHarness();
    const scene = cloneScene();
    scene.listener.position = { x: 3, y: 4 };
    scene.listener.headingDeg = 90;
    scene.sources[0]!.position = { x: 8, y: 2 };
    scene.sources[0]!.gainDb = -6;

    await harness.engine.start(scene);

    expect(harness.context.gains.some((gain) => gain.gain.targets.length > 0)).toBe(true);
    const panner = harness.context.panners[0]!;
    expect(panner.positionX.targets.at(-1)?.target).toBe(5);
    expect(panner.positionZ.targets.at(-1)?.target).toBe(2);
    expect(panner.positionX.targets.at(-1)?.timeConstant).toBeGreaterThanOrEqual(0.06);
    expect(harness.context.listener.forwardX.targets.at(-1)?.target).toBeCloseTo(1);
    expect(harness.context.listener.forwardZ.targets.at(-1)?.target).toBeCloseTo(0);
  });

  it("crossfades Raw and Simulated modes with automation without rebuilding", async () => {
    const harness = makeHarness();
    await harness.engine.start(cloneScene());
    const before = harness.engine.getDiagnostics();

    harness.engine.setMode("simulated");
    const after = harness.engine.getDiagnostics();

    expect(after.sourceGraphIds).toEqual(before.sourceGraphIds);
    expect(after.mode).toBe("simulated");
    expect(harness.context.gains.some((gain) =>
      gain.gain.targets.some(({ target, timeConstant }) => target === 0 && timeConstant === 0.05),
    )).toBe(true);
    expect(harness.context.gains.some((gain) =>
      gain.gain.targets.some(({ target, timeConstant }) => target === 1 && timeConstant === 0.05),
    )).toBe(true);
  });

  it("suspends, resumes the same sources, and disposes explicitly", async () => {
    const harness = makeHarness();
    const scene = cloneScene();
    await harness.engine.start(scene);

    await harness.engine.stop();
    expect(harness.engine.getDiagnostics().status).toBe("suspended");
    expect(harness.context.suspendCalls).toBe(1);

    await harness.engine.start(scene);
    expect(harness.engine.getDiagnostics().status).toBe("running");
    expect(harness.context.sources.every((source) => source.startCalls === 1)).toBe(true);

    await harness.engine.dispose();
    expect(harness.engine.getDiagnostics().status).toBe("disposed");
    expect(harness.context.sources.every((source) => source.stopCalls === 1)).toBe(true);
    expect(harness.context.closeCalls).toBe(1);
  });

  it("adds and removes source graphs only when the scene source set changes", async () => {
    const harness = makeHarness();
    const scene = cloneScene();
    await harness.engine.start(scene);
    const originalCount = harness.context.sources.length;

    const added = cloneScene();
    added.sources.push({
      ...structuredClone(added.sources[0]!),
      id: "second-radio",
      name: "Second radio",
      position: { x: 7, y: 6 },
    });
    await harness.engine.applyScene(added);
    expect(harness.context.sources).toHaveLength(originalCount + 1);
    expect(harness.engine.getDiagnostics().graphCount).toBe(added.sources.length);

    const removed = structuredClone(added);
    removed.sources.splice(0, 1);
    await harness.engine.applyScene(removed);
    expect(harness.engine.getDiagnostics().graphCount).toBe(removed.sources.length);
    expect(harness.engine.getDiagnostics().sourceStarts).toBe(originalCount + 1);
    expect(harness.context.sources[0]!.stopCalls).toBe(1);
  });

  it("rejects decoded assets that are not mono", async () => {
    const context = new FakeAudioContext();
    context.decodeAudioData = async () => ({ numberOfChannels: 2 });
    const engine = new AudioEngine({
      createContext: () => context,
      fetchArrayBuffer: async () => new ArrayBuffer(16),
    });

    await expect(engine.start(cloneScene())).rejects.toThrow(/mono/i);
    expect(engine.getDiagnostics().status).toBe("error");
  });
});
