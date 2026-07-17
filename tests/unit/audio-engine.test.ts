import { describe, expect, it } from "vitest";

import { AudioEngine } from "@/audio/AudioEngine";
import type { AcousticFrame } from "@/acoustics/compute-frame";
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
  value: number;
  readonly targets: Array<{ target: number; startTime: number; timeConstant: number }> = [];
  readonly curves: Array<{
    values: Float32Array;
    startTime: number;
    duration: number;
  }> = [];
  readonly cancellations: number[] = [];
  readonly holds: number[] = [];
  private activeCurveEnd = Number.NEGATIVE_INFINITY;

  constructor(initialValue = 0) {
    this.value = initialValue;
  }

  setTargetAtTime(target: number, startTime: number, timeConstant: number): AudioParamLike {
    this.targets.push({ target, startTime, timeConstant });
    return this;
  }

  setValueCurveAtTime(
    values: Float32Array,
    startTime: number,
    duration: number,
  ): AudioParamLike {
    if (startTime < this.activeCurveEnd - 1e-8) {
      throw new Error("Overlapping value curves require cancelAndHoldAtTime.");
    }
    this.curves.push({ values: Float32Array.from(values), startTime, duration });
    this.activeCurveEnd = startTime + duration;
    return this;
  }

  cancelScheduledValues(startTime: number): AudioParamLike {
    this.cancellations.push(startTime);
    return this;
  }

  cancelAndHoldAtTime(cancelTime: number): AudioParamLike {
    this.holds.push(cancelTime);
    this.activeCurveEnd = Math.min(this.activeCurveEnd, cancelTime);
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
  readonly gain = new FakeParam(1);
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

class FakeBiquadFilterNode extends FakeNode {
  type: BiquadFilterType = "lowpass";
  readonly frequency = new FakeParam(20_000);
}

class FakeBufferSourceNode extends FakeNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  startCalls = 0;
  stopCalls = 0;

  constructor(
    private readonly onStart: () => void,
    private readonly shouldThrowOnStart: () => boolean,
  ) {
    super();
  }

  start(): void {
    if (this.shouldThrowOnStart()) throw new Error("Injected source start failure.");
    this.startCalls += 1;
    this.onStart();
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
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly sources: FakeBufferSourceNode[] = [];
  readonly compressors: FakeCompressorNode[] = [];
  readonly gainValuesAtSourceStart: number[][] = [];
  failSourceStartNumber: number | null = null;
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

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createBufferSource(): AudioBufferSourceNodeLike {
    const sourceNumber = this.sources.length + 1;
    const node = new FakeBufferSourceNode(
      () => {
        this.gainValuesAtSourceStart.push(this.gains.map(({ gain }) => gain.value));
      },
      () => this.failSourceStartNumber === sourceNumber,
    );
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) return;
    await Promise.resolve();
  }
  throw new Error("Timed out waiting for asynchronous test condition.");
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
  it("applies blocked-frame direct gain, filter, route distance, and virtual panner position without creating another graph", async () => {
    const harness = makeHarness();
    const scene = cloneScene();
    const blockedFrame: AcousticFrame = {
      revision: scene.revision,
      generatedAtMs: 100,
      room: {
        volumeM3: 0,
        totalSurfaceM2: 0,
        rt60S: { low: 0, mid: 0, high: 0 },
        preDelayMs: 0,
      },
      sources: scene.sources.map((source) => ({
        sourceId: source.id,
        routeType: "blocked",
        directVisible: false,
        physicalDistanceM: 5,
        effectiveDistanceM: 8,
        dryGainDb: -12,
        lowpassHz: 1_500,
        reverbSendDb: 0,
        virtualPosition: { x: 4, y: 1 },
        occluderWallIds: ["partition"],
        portalIds: [],
        routePolyline: [source.position, scene.listener.position],
        earlyReflections: [],
      })),
    };

    await harness.engine.start(scene);
    harness.engine.applyAcousticFrame(blockedFrame);

    expect(harness.context.gains).toContainEqual(expect.objectContaining({ gain: expect.anything() }));
    expect(harness.context.filters[0]?.frequency.targets.at(-1)?.target).toBe(
      blockedFrame.sources[0]?.lowpassHz,
    );
    expect(harness.context.panners[0]?.positionX.targets.at(-1)?.target).toBe(
      blockedFrame.sources[0]?.virtualPosition.x - scene.listener.position.x,
    );
    expect(harness.engine.getDiagnostics().sourceStarts).toBe(2);

    const filterTargetCount = harness.context.filters[0]?.frequency.targets.length;
    harness.engine.applyAcousticFrame({ ...blockedFrame, revision: scene.revision + 1 });
    expect(harness.context.filters[0]?.frequency.targets).toHaveLength(filterTargetCount ?? 0);

    harness.engine.applyAcousticFrame(blockedFrame);
    expect(harness.context.sources).toHaveLength(scene.sources.length);
    expect(harness.engine.getDiagnostics().sourceStarts).toBe(2);
  });

  it("keeps matching frame simulated controls authoritative through topology sync", async () => {
    const harness = makeHarness();
    const scene = cloneScene();
    const frame: AcousticFrame = {
      revision: scene.revision,
      generatedAtMs: 100,
      room: { volumeM3: 0, totalSurfaceM2: 0, rt60S: { low: 0, mid: 0, high: 0 }, preDelayMs: 0 },
      sources: scene.sources.map((source) => ({
        sourceId: source.id,
        routeType: "blocked",
        directVisible: false,
        physicalDistanceM: 1,
        effectiveDistanceM: 9,
        dryGainDb: -18,
        lowpassHz: 900,
        reverbSendDb: 0,
        virtualPosition: { x: 1, y: 9 },
        occluderWallIds: [],
        portalIds: [],
        routePolyline: [source.position, scene.listener.position],
        earlyReflections: [],
      })),
    };

    await harness.engine.start(scene);
    harness.engine.applyAcousticFrame(frame);
    const frameControlledPannerTargetCount = harness.context.panners[0]?.positionX.targets.length;
    await harness.engine.applyScene(scene);

    expect(harness.context.panners[0]?.positionX.targets).toHaveLength(
      (frameControlledPannerTargetCount ?? 0) + 1,
    );
    expect(harness.context.panners[0]?.positionX.targets.at(-1)?.target).toBe(
      frame.sources[0]?.virtualPosition.x - scene.listener.position.x,
    );
    expect(harness.context.filters[0]?.frequency.targets.at(-1)?.target).toBe(
      frame.sources[0]?.lowpassHz,
    );
  });

  it("leaves the Raw branch untouched when a matching acoustic frame is applied", async () => {
    const harness = makeHarness();
    const scene = cloneScene();
    const frame: AcousticFrame = {
      revision: scene.revision,
      generatedAtMs: 100,
      room: { volumeM3: 0, totalSurfaceM2: 0, rt60S: { low: 0, mid: 0, high: 0 }, preDelayMs: 0 },
      sources: scene.sources.map((source) => ({
        sourceId: source.id,
        routeType: "blocked",
        directVisible: false,
        physicalDistanceM: 1,
        effectiveDistanceM: 9,
        dryGainDb: -18,
        lowpassHz: 900,
        reverbSendDb: 0,
        virtualPosition: { x: 1, y: 9 },
        occluderWallIds: [],
        portalIds: [],
        routePolyline: [source.position, scene.listener.position],
        earlyReflections: [],
      })),
    };

    await harness.engine.start(scene);
    const rawGainTargets = harness.context.gains[2]?.gain.targets.length;
    harness.engine.applyAcousticFrame(frame);

    expect(harness.context.gains[2]?.gain.targets).toHaveLength(rawGainTargets ?? 0);
  });

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

  it("honors hrtfEnabled at start and updates panning models without rebuilding graphs", async () => {
    const harness = makeHarness();
    const scene = cloneScene();
    scene.settings.hrtfEnabled = false;

    await harness.engine.start(scene);
    const before = harness.engine.getDiagnostics().sourceGraphIds;
    expect(harness.context.panners.every((panner) => panner.panningModel === "equalpower")).toBe(true);

    const enabled = structuredClone(scene);
    enabled.revision += 1;
    enabled.settings.hrtfEnabled = true;
    await harness.engine.applyScene(enabled);

    expect(harness.context.panners.every((panner) => panner.panningModel === "HRTF")).toBe(true);
    expect(harness.engine.getDiagnostics().sourceGraphIds).toEqual(before);
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

  it("serializes a deferred start with scene updates so only the latest scene is committed", async () => {
    const context = new FakeAudioContext();
    const loading = deferred<ArrayBuffer>();
    let fetchCalls = 0;
    const engine = new AudioEngine({
      createContext: () => context,
      fetchArrayBuffer: () => {
        fetchCalls += 1;
        return loading.promise;
      },
    });
    const initial = cloneScene();
    initial.sources.splice(1);
    const latest = structuredClone(initial);
    latest.revision += 1;
    latest.sources[0]!.position = { x: 9, y: 1 };

    const starting = engine.start(initial);
    await waitFor(() => fetchCalls === 1);
    const applying = engine.applyScene(latest);
    loading.resolve(new ArrayBuffer(16));
    await Promise.all([starting, applying]);

    expect(context.sources).toHaveLength(1);
    expect(engine.getDiagnostics().graphCount).toBe(1);
    expect(context.panners).toHaveLength(1);
    expect(context.panners[0]!.positionX.targets.at(-1)?.target).toBe(
      latest.sources[0]!.position.x - latest.listener.position.x,
    );
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
    expect(
      harness.context.gains
        .flatMap(({ gain }) => gain.targets)
        .every(({ timeConstant }) => timeConstant === 0.08),
    ).toBe(true);
    const panner = harness.context.panners[0]!;
    expect(panner.positionX.targets.at(-1)?.target).toBe(5);
    expect(panner.positionZ.targets.at(-1)?.target).toBe(2);
    expect(panner.positionX.targets.at(-1)?.timeConstant).toBe(0.08);
    expect(harness.context.listener.forwardX.targets.at(-1)?.target).toBeCloseTo(1);
    expect(harness.context.listener.forwardZ.targets.at(-1)?.target).toBeCloseTo(0);
    expect(
      Object.values(harness.context.listener)
        .flatMap((parameter) => parameter.targets)
        .every(({ timeConstant }) => timeConstant === 0.08),
    ).toBe(true);
  });

  it("initializes mode gains before playback and schedules an 80 ms equal-power curve", async () => {
    const harness = makeHarness();
    await harness.engine.start(cloneScene());
    const before = harness.engine.getDiagnostics();

    expect(harness.context.gainValuesAtSourceStart[0]![2]).toBe(1);
    expect(harness.context.gainValuesAtSourceStart[0]![3]).toBe(0);

    harness.engine.setMode("simulated");
    const after = harness.engine.getDiagnostics();

    expect(after.sourceGraphIds).toEqual(before.sourceGraphIds);
    expect(after.mode).toBe("simulated");
    const rawCurve = harness.context.gains[2]!.gain.curves.at(-1)!;
    const simulatedCurve = harness.context.gains[3]!.gain.curves.at(-1)!;
    expect(rawCurve.duration).toBe(0.08);
    expect(simulatedCurve.duration).toBe(0.08);
    expect(rawCurve.values[0]).toBeCloseTo(1);
    expect(rawCurve.values.at(-1)).toBeCloseTo(0);
    expect(simulatedCurve.values[0]).toBeCloseTo(0);
    expect(simulatedCurve.values.at(-1)).toBeCloseTo(1);
    expect(rawCurve.values).toHaveLength(simulatedCurve.values.length);
    for (let index = 0; index < rawCurve.values.length; index += 1) {
      expect(rawCurve.values[index]! ** 2 + simulatedCurve.values[index]! ** 2)
        .toBeCloseTo(1, 5);
    }
  });

  it("holds the in-flight equal-power mix before reversing mode without overlapping curves", async () => {
    const harness = makeHarness();
    await harness.engine.start(cloneScene());
    harness.engine.setMode("simulated");
    harness.context.currentTime += 0.04;

    expect(() => harness.engine.setMode("raw")).not.toThrow();

    const rawParam = harness.context.gains[2]!.gain;
    const simulatedParam = harness.context.gains[3]!.gain;
    expect(rawParam.holds.at(-1)).toBe(4.04);
    expect(simulatedParam.holds.at(-1)).toBe(4.04);
    const rawCurve = rawParam.curves.at(-1)!;
    const simulatedCurve = simulatedParam.curves.at(-1)!;
    expect(rawCurve.startTime).toBe(4.04);
    expect(simulatedCurve.startTime).toBe(4.04);
    expect(rawCurve.values[0]).toBeCloseTo(Math.SQRT1_2);
    expect(simulatedCurve.values[0]).toBeCloseTo(Math.SQRT1_2);
    expect(rawCurve.values.at(-1)).toBeCloseTo(1);
    expect(simulatedCurve.values.at(-1)).toBeCloseTo(0);
    for (let index = 0; index < rawCurve.values.length; index += 1) {
      expect(rawCurve.values[index]! ** 2 + simulatedCurve.values[index]! ** 2)
        .toBeCloseTo(1, 5);
    }
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

  it("loads every required buffer before creating graphs and evicts failures for retry", async () => {
    const context = new FakeAudioContext();
    let rainAttempts = 0;
    const engine = new AudioEngine({
      createContext: () => context,
      fetchArrayBuffer: async (url) => {
        if (url.includes("rain-loop")) {
          rainAttempts += 1;
          if (rainAttempts === 1) throw new Error("Injected asset failure.");
        }
        return new ArrayBuffer(16);
      },
    });
    const scene = cloneScene();

    await expect(engine.start(scene)).rejects.toThrow(/asset failure/i);
    expect(context.sources).toHaveLength(0);
    expect(engine.getDiagnostics().graphCount).toBe(0);

    await engine.start(scene);
    expect(rainAttempts).toBe(2);
    expect(context.sources).toHaveLength(scene.sources.length);
    expect(engine.getDiagnostics().graphCount).toBe(scene.sources.length);
  });

  it("keeps scene updates inert after an initial Start failure until an explicit retry", async () => {
    const context = new FakeAudioContext();
    const firstLoad = deferred<ArrayBuffer>();
    let fetchCalls = 0;
    const engine = new AudioEngine({
      createContext: () => context,
      fetchArrayBuffer: () => {
        fetchCalls += 1;
        return fetchCalls === 1
          ? firstLoad.promise
          : Promise.resolve(new ArrayBuffer(16));
      },
    });
    const initial = cloneScene();
    initial.sources.splice(1);
    const starting = engine.start(initial);
    await waitFor(() => fetchCalls === 1);
    firstLoad.reject(new Error("Injected initial Start failure."));
    await expect(starting).rejects.toThrow(/initial Start failure/i);

    const latest = structuredClone(initial);
    latest.revision += 1;
    latest.sources[0]!.position = { x: 8, y: 2 };
    await engine.applyScene(latest);

    expect(fetchCalls).toBe(1);
    expect(context.decodeCalls).toBe(0);
    expect(context.sources).toHaveLength(0);
    expect(context.resumeCalls).toBe(0);

    await engine.start(latest);
    expect(fetchCalls).toBe(2);
    expect(context.sources).toHaveLength(1);
    expect(context.resumeCalls).toBe(1);
    expect(engine.getDiagnostics().status).toBe("running");
    expect(context.panners[0]!.positionX.targets.at(-1)?.target).toBe(
      latest.sources[0]!.position.x - latest.listener.position.x,
    );
  });

  it("does not let an older failed Start cancel a newer concurrent Start intent", async () => {
    const context = new FakeAudioContext();
    const firstLoad = deferred<ArrayBuffer>();
    const secondLoad = deferred<ArrayBuffer>();
    let fetchCalls = 0;
    const engine = new AudioEngine({
      createContext: () => context,
      fetchArrayBuffer: () => {
        fetchCalls += 1;
        return fetchCalls === 1 ? firstLoad.promise : secondLoad.promise;
      },
    });
    const initial = cloneScene();
    initial.sources.splice(1);
    const latest = structuredClone(initial);
    latest.revision += 1;
    latest.sources[0]!.position = { x: 9, y: 2 };

    const firstOutcome = engine.start(initial).then(
      () => null,
      (error: unknown) => error,
    );
    await waitFor(() => fetchCalls === 1);
    const secondOutcome = engine.start(latest).then(
      () => null,
      (error: unknown) => error,
    );
    firstLoad.reject(new Error("Injected obsolete Start failure."));
    expect(await firstOutcome).toBeInstanceOf(Error);
    await waitFor(() => fetchCalls === 2);
    secondLoad.resolve(new ArrayBuffer(16));

    expect(await secondOutcome).toBeNull();
    expect(engine.getDiagnostics().status).toBe("running");
    expect(context.sources).toHaveLength(1);
    expect(context.panners[0]!.positionX.targets.at(-1)?.target).toBe(
      latest.sources[0]!.position.x - latest.listener.position.x,
    );
  });

  it("keeps committed graphs intact when replacement loading fails, then retries transactionally", async () => {
    const context = new FakeAudioContext();
    let failRain = true;
    const engine = new AudioEngine({
      createContext: () => context,
      fetchArrayBuffer: async (url) => {
        if (url.includes("rain-loop") && failRain) {
          failRain = false;
          throw new Error("Injected replacement failure.");
        }
        return new ArrayBuffer(16);
      },
    });
    const initial = cloneScene();
    initial.sources.splice(1);
    await engine.start(initial);
    const committed = engine.getDiagnostics();
    const replacement = cloneScene();
    replacement.sources.splice(0, 1);

    await expect(engine.applyScene(replacement)).rejects.toThrow(/replacement failure/i);
    expect(engine.getDiagnostics().sourceGraphIds).toEqual(committed.sourceGraphIds);
    expect(context.sources[0]!.stopCalls).toBe(0);

    await engine.applyScene(replacement);
    expect(engine.getDiagnostics().graphCount).toBe(1);
    expect(context.sources[0]!.stopCalls).toBe(1);
  });

  it("rolls back newly created graphs when graph construction fails and can retry", async () => {
    const harness = makeHarness();
    const initial = cloneScene();
    initial.sources.splice(1);
    await harness.engine.start(initial);
    const committed = harness.engine.getDiagnostics();
    const expanded = cloneScene();
    expanded.sources.push({
      ...structuredClone(expanded.sources[0]!),
      id: "voice-extra",
      name: "Voice extra",
      clipId: "voice_loop",
    });
    harness.context.failSourceStartNumber = 3;

    await expect(harness.engine.applyScene(expanded)).rejects.toThrow(/source start failure/i);
    expect(harness.engine.getDiagnostics().sourceGraphIds).toEqual(committed.sourceGraphIds);
    expect(harness.context.sources[0]!.stopCalls).toBe(0);
    expect(harness.context.sources[1]!.stopCalls).toBe(1);
    expect(harness.context.sources[1]!.disconnectCalls).toBeGreaterThan(0);

    harness.context.failSourceStartNumber = null;
    await harness.engine.applyScene(expanded);
    expect(harness.engine.getDiagnostics().graphCount).toBe(expanded.sources.length);
  });

  it("honors stop requested while start is waiting without stale resume or running status", async () => {
    const context = new FakeAudioContext();
    const loading = deferred<ArrayBuffer>();
    let fetchCalls = 0;
    const engine = new AudioEngine({
      createContext: () => context,
      fetchArrayBuffer: () => {
        fetchCalls += 1;
        return loading.promise;
      },
    });
    const scene = cloneScene();
    scene.sources.splice(1);

    const starting = engine.start(scene);
    await waitFor(() => fetchCalls === 1);
    const stopping = engine.stop();
    loading.resolve(new ArrayBuffer(16));
    await Promise.all([starting, stopping]);

    expect(context.resumeCalls).toBe(0);
    expect(context.sources).toHaveLength(0);
    expect(engine.getDiagnostics().sourceStarts).toBe(0);
    expect(engine.getDiagnostics().status).toBe("suspended");
  });

  it("invalidates a deferred load immediately on dispose and ignores its late completion", async () => {
    const context = new FakeAudioContext();
    const loading = deferred<ArrayBuffer>();
    let fetchCalls = 0;
    const engine = new AudioEngine({
      createContext: () => context,
      fetchArrayBuffer: () => {
        fetchCalls += 1;
        return loading.promise;
      },
    });
    const scene = cloneScene();
    scene.sources.splice(1);

    const starting = engine.start(scene);
    await waitFor(() => fetchCalls === 1);
    const disposing = engine.dispose();
    expect(engine.getDiagnostics().status).toBe("disposed");
    expect(engine.getDiagnostics().graphCount).toBe(0);
    loading.resolve(new ArrayBuffer(16));
    await Promise.all([starting, disposing]);

    expect(context.sources).toHaveLength(0);
    expect(engine.getDiagnostics()).toMatchObject({
      error: null,
      graphCount: 0,
      status: "disposed",
    });
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
