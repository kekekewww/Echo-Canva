import { describe, expect, it } from "vitest";

import {
  computeAcousticFrame,
  computeClassicSourceResults,
  type ClassicStaticContext,
} from "@/acoustics/compute-frame";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { HARD_ROOM_PRESET } from "@/domain/presets/hard-room";
import type { SceneSpec } from "@/domain/scene/types";
import type {
  AcousticWorkerResponse,
} from "@/workers/acoustics.worker";
import type {
  ClassicSourceWorkerRequest,
  ClassicSourceWorkerResponse,
} from "@/workers/classic-source.worker";
import { createClassicSourcePool } from "@/workers/classic-source-pool";
import { classicSourcePoolCapacity } from "@/workers/worker-pool-policy";

class FakeTimers {
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();

  schedule = (callback: () => void): number => {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  };

  cancel = (id: number): void => {
    this.callbacks.delete(id);
  };

  flush(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback());
  }
}

class FakeTimeline {
  nowMs = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { callback: () => void; dueMs: number }>();

  schedule = (callback: () => void, delayMs: number): number => {
    const id = this.nextId++;
    this.tasks.set(id, { callback, dueMs: this.nowMs + delayMs });
    return id;
  };

  cancel = (id: number): void => {
    this.tasks.delete(id);
  };

  advance(ms: number): void {
    this.nowMs += ms;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.dueMs <= this.nowMs)
        .sort(([, left], [, right]) => left.dueMs - right.dueMs)[0];
      if (!next) return;
      this.tasks.delete(next[0]);
      next[1].callback();
    }
  }

  pendingDueMs(): number[] {
    return [...this.tasks.values()].map(({ dueMs }) => dueMs);
  }
}

class FakeShardWorker {
  readonly posted: ClassicSourceWorkerRequest[] = [];
  onerror: ((event: ErrorEvent) => unknown) | null = null;
  onmessage: ((event: MessageEvent<ClassicSourceWorkerResponse>) => unknown) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => unknown) | null = null;
  terminateCalls = 0;
  private readonly acknowledgedInstalls = new Set<number>();

  postMessage(request: ClassicSourceWorkerRequest): void {
    this.posted.push(request);
  }

  terminate(): void {
    this.terminateCalls += 1;
  }

  emit(response: unknown): void {
    this.onmessage?.({ data: response } as MessageEvent<ClassicSourceWorkerResponse>);
  }

  resolve(computeMs: number): void {
    this.ackInstall();
    this.emit(this.shardResponse(computeMs));
  }

  ackInstall(): void {
    const install = this.posted.findLast(
      (request): request is Extract<ClassicSourceWorkerRequest, { type: "INSTALL_STATIC" }> =>
        request.type === "INSTALL_STATIC",
    );
    if (!install || this.acknowledgedInstalls.has(install.requestId)) return;
    this.acknowledgedInstalls.add(install.requestId);
    this.emit({
      type: "STATIC_INSTALLED",
      requestId: install.requestId,
      staticFingerprint: install.context.fingerprint,
    });
  }

  shardResponse(computeMs: number): Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }> {
    const install = this.posted.findLast(
      (request): request is Extract<ClassicSourceWorkerRequest, { type: "INSTALL_STATIC" }> =>
        request.type === "INSTALL_STATIC",
    );
    const compute = this.posted.findLast(
      (request): request is Extract<ClassicSourceWorkerRequest, { type: "COMPUTE_SHARD" }> =>
        request.type === "COMPUTE_SHARD",
    );
    if (!install || !compute) throw new Error("No pending shard");
    return {
      type: "SHARD_RESULT",
      requestId: compute.requestId,
      staticFingerprint: compute.staticFingerprint,
      revision: compute.snapshot.revision,
      sourceIds: compute.sourceIds,
      results: computeClassicSourceResults(
        install.context as ClassicStaticContext,
        compute.snapshot,
        compute.sourceIds,
      ),
      computeMs,
      completedAtMs: 0,
    };
  }
}

function sceneWithSources(count: number, revision = 1): SceneSpec {
  const scene = structuredClone(CONCRETE_PARTITION_PRESET);
  scene.revision = revision;
  scene.sources = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(CONCRETE_PARTITION_PRESET.sources[index % 2]!),
    id: `source-${index}`,
    name: `Source ${index}`,
    position: { x: 8 + index * 0.5, y: 1 + index },
  }));
  return scene;
}

describe("Classic source pool policy", () => {
  it.each([
    [undefined, 1],
    [Number.NaN, 1],
    [-4, 1],
    [0, 1],
    [1, 1],
    [2, 1],
    [4, 2],
    [8, 4],
    [128, 4],
  ])("maps hardware concurrency %s to capacity %s", (hardwareConcurrency, expected) => {
    expect(classicSourcePoolCapacity(hardwareConcurrency)).toBe(expected);
  });
});

describe("Classic source Worker pool", () => {
  it.each([2, 4])("posts %s source shards before any result resolves", (sourceCount) => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 8,
      schedule: timers.schedule,
    });

    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(sourceCount) });
    timers.flush();

    expect(workers).toHaveLength(sourceCount);
    expect(workers.map((worker) => worker.posted.at(-1))).toEqual(
      Array.from({ length: sourceCount }, (_, index) => expect.objectContaining({
        type: "COMPUTE_SHARD",
        sourceIds: [`source-${index}`],
      })),
    );
  });

  it("merges reverse completion in authored order with exact serial output and pool metrics", () => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const responses: AcousticWorkerResponse[] = [];
    let nowMs = 100;
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        nowMs += 2;
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 8,
      now: () => nowMs,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => responses.push(event.data);
    const scene = sceneWithSources(4, 12);

    pool.postMessage({ type: "UPDATE_SCENE", scene });
    timers.flush();
    workers[3]!.resolve(7);
    workers[2]!.resolve(3);
    workers[1]!.resolve(5);
    nowMs = 120;
    workers[0]!.resolve(2);

    expect(responses).toEqual([{
      type: "FRAME",
      revision: 12,
      frame: computeAcousticFrame(scene, 100),
      metrics: {
        computeMs: 20,
        completedAtMs: 120,
        requestSequence: 1,
        workerCount: 4,
        sourceComputeMsMax: 7,
        sourceComputeMsTotal: 17,
      },
    }]);
  });

  it("reuses workers, scales active workers with sources, and preserves source assignments", () => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const frames: AcousticWorkerResponse[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 8,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => frames.push(event.data);

    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(1, 20) });
    timers.flush();
    workers[0]!.resolve(1);
    expect(workers).toHaveLength(1);

    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(4, 21) });
    timers.flush();
    workers.forEach((worker) => worker.resolve(1));
    expect(workers).toHaveLength(4);

    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(2, 22) });
    timers.flush();
    workers.slice(0, 2).forEach((worker) => worker.resolve(1));

    expect(workers).toHaveLength(4);
    expect(frames.filter((response) => response.type === "FRAME").map((response) => response.frame.sources.map(({ sourceId }) => sourceId))).toEqual([
      ["source-0"],
      ["source-0", "source-1", "source-2", "source-3"],
      ["source-0", "source-1"],
    ]);
  });

  it("does not reinstall static context for pose-only updates and installs changes before compute", () => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 8,
      schedule: timers.schedule,
    });
    const initial = sceneWithSources(2, 30);

    pool.postMessage({ type: "UPDATE_SCENE", scene: initial });
    timers.flush();
    workers.forEach((worker) => worker.resolve(1));

    const poseOnly = structuredClone(initial);
    poseOnly.revision = 31;
    poseOnly.listener.position.x += 0.25;
    pool.postMessage({ type: "UPDATE_SCENE", scene: poseOnly });
    timers.flush();
    expect(workers.map((worker) => worker.posted.filter(({ type }) => type === "INSTALL_STATIC").length)).toEqual([1, 1]);
    workers.forEach((worker) => worker.resolve(1));

    const changed = structuredClone(poseOnly);
    changed.revision = 32;
    changed.walls[0]!.materialId = "wood_medium";
    pool.postMessage({ type: "UPDATE_SCENE", scene: changed });
    timers.flush();

    expect(workers.map((worker) => worker.posted.slice(-2).map(({ type }) => type))).toEqual([
      ["INSTALL_STATIC", "COMPUTE_SHARD"],
      ["INSTALL_STATIC", "COMPUTE_SHARD"],
    ]);
  });

  it("keeps one job in flight, suppresses obsolete output, and computes only the newest pending scene", () => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const frames: AcousticWorkerResponse[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 8,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => frames.push(event.data);

    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(2, 40) });
    timers.flush();
    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(2, 41) });
    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(2, 42) });
    timers.flush();

    expect(workers.map((worker) => worker.posted.filter(({ type }) => type === "COMPUTE_SHARD").length)).toEqual([1, 1]);
    workers.forEach((worker) => worker.resolve(1));
    expect(frames).toEqual([]);

    timers.flush();
    workers.forEach((worker) => worker.resolve(1));
    expect(frames.map((response) => response.revision)).toEqual([42]);
  });

  it("reschedules the 10-15 Hz cadence using the newest pending scene rate", () => {
    const timeline = new FakeTimeline();
    const workers: FakeShardWorker[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timeline.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 1,
      now: () => timeline.nowMs,
      schedule: timeline.schedule,
    });
    const first = sceneWithSources(1, 45);
    first.settings.acousticUpdateHz = 15;
    pool.postMessage({ type: "UPDATE_SCENE", scene: first });
    timeline.advance(0);
    workers[0]!.resolve(1);

    timeline.advance(1);
    const intermediate = sceneWithSources(1, 46);
    intermediate.settings.acousticUpdateHz = 15;
    pool.postMessage({ type: "UPDATE_SCENE", scene: intermediate });
    const latest = sceneWithSources(1, 47);
    latest.settings.acousticUpdateHz = 10;
    pool.postMessage({ type: "UPDATE_SCENE", scene: latest });

    expect(timeline.pendingDueMs()).toEqual([100]);
    timeline.advance(98);
    expect(workers[0]!.posted.filter(({ type }) => type === "COMPUTE_SHARD")).toHaveLength(1);
    timeline.advance(1);
    expect(workers[0]!.posted.filter(({ type }) => type === "COMPUTE_SHARD")).toHaveLength(2);
  });

  it("round-robins four authored sources across a two-worker capacity", () => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 4,
      schedule: timers.schedule,
    });

    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(4, 48) });
    timers.flush();

    expect(workers.map((worker) => worker.posted.at(-1))).toEqual([
      expect.objectContaining({ type: "COMPUTE_SHARD", sourceIds: ["source-0", "source-2"] }),
      expect.objectContaining({ type: "COMPUTE_SHARD", sourceIds: ["source-1", "source-3"] }),
    ]);
  });

  it.each([
    ["request", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, requestId: response.requestId + 1 })],
    ["revision", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, revision: response.revision + 1 })],
    ["fingerprint", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, staticFingerprint: "wrong" })],
    ["assignment", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, sourceIds: ["wrong-source"] })],
  ] as const)("fails the complete pool on a wrong %s shard", (_, alter) => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const responses: AcousticWorkerResponse[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 8,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => responses.push(event.data);
    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(2, 50) });
    timers.flush();

    workers[0]!.emit(alter(workers[0]!.shardResponse(1)) as ClassicSourceWorkerResponse);
    workers[1]!.resolve(1);

    expect(responses).toEqual([expect.objectContaining({
      type: "ERROR",
      revision: 50,
      code: "CLASSIC_POOL_FAILED",
    })]);
    expect(workers.map(({ terminateCalls }) => terminateCalls)).toEqual([1, 1]);
  });

  it.each([
    ["null source IDs", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, sourceIds: null })],
    ["null results", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: null })],
    ["null result", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: [null] })],
    ["null nested frame", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: [{ ...response.results[0], frame: null }] })],
    ["non-finite nested frame", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        frame: { ...response.results[0]!.frame, physicalDistanceM: Number.NaN },
      }],
    })],
  ] as const)("fails closed on a shard with %s", (_, alter) => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const responses: AcousticWorkerResponse[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 8,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => responses.push(event.data);
    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(2, 55) });
    timers.flush();

    expect(() => workers[0]!.emit(alter(workers[0]!.shardResponse(1)))).not.toThrow();
    workers[1]!.resolve(1);

    expect(responses).toEqual([expect.objectContaining({
      type: "ERROR",
      revision: 55,
      code: "CLASSIC_POOL_FAILED",
    })]);
    expect(workers.map(({ terminateCalls }) => terminateCalls)).toEqual([1, 1]);
  });

  it.each([
    ["negative distance", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{ ...response.results[0], frame: { ...response.results[0]!.frame, physicalDistanceM: -1 } }],
    })],
    ["out-of-range cutoff", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{ ...response.results[0], frame: { ...response.results[0]!.frame, lowpassHz: 20_001 } }],
    })],
    ["inconsistent direct route", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{ ...response.results[0], frame: { ...response.results[0]!.frame, routeType: "direct", directVisible: false } }],
    })],
    ["unknown occluder", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{ ...response.results[0], frame: { ...response.results[0]!.frame, occluderWallIds: ["unknown-wall"] } }],
    })],
    ["too many reflections", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        frame: {
          ...response.results[0]!.frame,
          earlyReflections: Array.from({ length: 7 }, () => response.results[0]!.frame.earlyReflections[0] ?? {
            wallId: "partition_center",
            reflectionPoint: { x: 1, y: 1 },
            pathLengthM: 1,
            delayMs: 1,
            gainDb: -1,
            lowpassHz: 1_000,
          }),
        },
      }],
    })],
    ["negative reflection delay", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        frame: {
          ...response.results[0]!.frame,
          earlyReflections: [{
            ...(response.results[0]!.frame.earlyReflections[0] ?? {
              wallId: "partition_center",
              reflectionPoint: { x: 1, y: 1 },
              pathLengthM: 1,
              gainDb: -1,
              lowpassHz: 1_000,
            }),
            delayMs: -0.1,
          }],
        },
      }],
    })],
  ] as const)("fails closed on finite but invalid %s", (_, alter) => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const responses: AcousticWorkerResponse[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 1,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => responses.push(event.data);
    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(1, 56) });
    timers.flush();
    workers[0]!.ackInstall();

    workers[0]!.emit(alter(workers[0]!.shardResponse(1)) as unknown);

    expect(responses).toEqual([expect.objectContaining({
      type: "ERROR",
      revision: 56,
      code: "CLASSIC_POOL_FAILED",
    })]);
    expect(workers[0]!.terminateCalls).toBe(1);
  });

  it.each([
    ["physical distance", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        frame: {
          ...response.results[0]!.frame,
          physicalDistanceM: response.results[0]!.frame.physicalDistanceM + 0.25,
          effectiveDistanceM: response.results[0]!.frame.effectiveDistanceM + 0.25,
        },
      }],
    })],
    ["route endpoint", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        frame: {
          ...response.results[0]!.frame,
          routePolyline: response.results[0]!.frame.routePolyline.map((point, index) =>
            index === 0 ? { x: point.x + 0.25, y: point.y } : point),
        },
      }],
    })],
    ["reflection path length", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        frame: {
          ...response.results[0]!.frame,
          earlyReflections: response.results[0]!.frame.earlyReflections.map((reflection, index) =>
            index === 0 ? { ...reflection, pathLengthM: reflection.pathLengthM + 0.25 } : reflection),
        },
      }],
    })],
    ["reflection delay", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        frame: {
          ...response.results[0]!.frame,
          earlyReflections: response.results[0]!.frame.earlyReflections.map((reflection, index) =>
            index === 0 ? { ...reflection, delayMs: reflection.delayMs + 0.5 } : reflection),
        },
      }],
    })],
    ["non-specular reflection point", (response: Extract<ClassicSourceWorkerResponse, { type: "SHARD_RESULT" }>) => {
      const point = { x: 5, y: 0 };
      const pathLengthM = Math.hypot(7.5 - point.x, 4 - point.y)
        + Math.hypot(point.x - 3, point.y - 4);
      return {
        ...response,
        results: [{
          ...response.results[0],
          frame: {
            ...response.results[0]!.frame,
            earlyReflections: response.results[0]!.frame.earlyReflections.map((reflection, index) =>
              index === 0
                ? {
                    ...reflection,
                    reflectionPoint: point,
                    pathLengthM,
                    delayMs: ((pathLengthM - 4.5) / 343) * 1_000,
                  }
                : reflection),
          },
        }],
      };
    }],
  ] as const)("fails closed on plausible but inconsistent %s", (_, alter) => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const responses: AcousticWorkerResponse[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 1,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => responses.push(event.data);
    const scene = structuredClone(HARD_ROOM_PRESET);
    scene.revision = 57;
    pool.postMessage({ type: "UPDATE_SCENE", scene });
    timers.flush();
    workers[0]!.ackInstall();
    const valid = workers[0]!.shardResponse(1);
    expect(valid.results[0]!.frame.earlyReflections.length).toBeGreaterThan(0);

    workers[0]!.emit(alter(valid) as unknown);

    expect(responses).toEqual([expect.objectContaining({
      type: "ERROR",
      revision: 57,
      code: "CLASSIC_POOL_FAILED",
    })]);
    expect(workers[0]!.terminateCalls).toBe(1);
  });

  it("fails closed on an unexpected or duplicate static acknowledgement", () => {
    for (const mode of ["unexpected", "duplicate"] as const) {
      const timers = new FakeTimers();
      const workers: FakeShardWorker[] = [];
      const responses: AcousticWorkerResponse[] = [];
      const pool = createClassicSourcePool({
        cancel: (timer) => timers.cancel(timer as number),
        createWorker: () => {
          const worker = new FakeShardWorker();
          workers.push(worker);
          return worker;
        },
        hardwareConcurrency: 1,
        schedule: timers.schedule,
      });
      pool.onmessage = (event) => responses.push(event.data);
      const initial = sceneWithSources(1, 57);
      pool.postMessage({ type: "UPDATE_SCENE", scene: initial });
      timers.flush();
      workers[0]!.ackInstall();
      if (mode === "unexpected") {
        workers[0]!.resolve(1);
        const moved = structuredClone(initial);
        moved.revision = 58;
        moved.listener.position.x += 0.1;
        pool.postMessage({ type: "UPDATE_SCENE", scene: moved });
        timers.flush();
        const compute = workers[0]!.posted.at(-1)! as Extract<ClassicSourceWorkerRequest, { type: "COMPUTE_SHARD" }>;
        workers[0]!.emit({
          type: "STATIC_INSTALLED",
          requestId: compute.requestId,
          staticFingerprint: compute.staticFingerprint,
        });
      } else {
        const install = workers[0]!.posted[0]! as Extract<ClassicSourceWorkerRequest, { type: "INSTALL_STATIC" }>;
        workers[0]!.emit({
          type: "STATIC_INSTALLED",
          requestId: install.requestId,
          staticFingerprint: install.context.fingerprint,
        });
      }
      expect(responses.at(-1)).toMatchObject({ type: "ERROR", code: "CLASSIC_POOL_FAILED" });
      expect(workers[0]!.terminateCalls).toBe(1);
    }
  });

  it("times out a non-responsive job and cancels the watchdog on completion", () => {
    const cadence = new FakeTimers();
    const watchdog = new FakeTimeline();
    const workers: FakeShardWorker[] = [];
    const responses: AcousticWorkerResponse[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => cadence.cancel(timer as number),
      cancelWatchdog: (timer) => watchdog.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 1,
      jobTimeoutMs: 25,
      schedule: cadence.schedule,
      scheduleWatchdog: watchdog.schedule,
    });
    pool.onmessage = (event) => responses.push(event.data);
    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(1, 59) });
    cadence.flush();
    watchdog.advance(24);
    expect(responses).toEqual([]);
    watchdog.advance(1);
    expect(responses).toEqual([expect.objectContaining({ type: "ERROR", revision: 59 })]);
    expect(workers[0]!.terminateCalls).toBe(1);

    const completedWatchdog = new FakeTimeline();
    const completedCadence = new FakeTimers();
    const completedWorkers: FakeShardWorker[] = [];
    const completedResponses: AcousticWorkerResponse[] = [];
    const completedPool = createClassicSourcePool({
      cancel: (timer) => completedCadence.cancel(timer as number),
      cancelWatchdog: (timer) => completedWatchdog.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        completedWorkers.push(worker);
        return worker;
      },
      hardwareConcurrency: 1,
      jobTimeoutMs: 25,
      schedule: completedCadence.schedule,
      scheduleWatchdog: completedWatchdog.schedule,
    });
    completedPool.onmessage = (event) => completedResponses.push(event.data);
    completedPool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(1, 60) });
    completedCadence.flush();
    completedWorkers[0]!.resolve(1);
    completedWatchdog.advance(25);
    expect(completedResponses).toHaveLength(1);
    expect(completedResponses[0]).toMatchObject({ type: "FRAME", revision: 60 });

    const disposedCadence = new FakeTimers();
    const disposedWatchdog = new FakeTimeline();
    const disposedWorkers: FakeShardWorker[] = [];
    const disposedResponses: AcousticWorkerResponse[] = [];
    const disposedPool = createClassicSourcePool({
      cancel: (timer) => disposedCadence.cancel(timer as number),
      cancelWatchdog: (timer) => disposedWatchdog.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        disposedWorkers.push(worker);
        return worker;
      },
      hardwareConcurrency: 1,
      jobTimeoutMs: 25,
      schedule: disposedCadence.schedule,
      scheduleWatchdog: disposedWatchdog.schedule,
    });
    disposedPool.onmessage = (event) => disposedResponses.push(event.data);
    disposedPool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(1, 61) });
    disposedCadence.flush();
    disposedPool.terminate();
    disposedWatchdog.advance(25);
    expect(disposedResponses).toEqual([]);
    expect(disposedWorkers[0]!.terminateCalls).toBe(1);
  });

  it.each(["typed", "onerror", "onmessageerror"] as const)("fails once and terminates all workers on %s failure", (failureMode) => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const responses: AcousticWorkerResponse[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 8,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => responses.push(event.data);
    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(2, 60) });
    timers.flush();

    if (failureMode === "typed") workers[0]!.emit({
      type: "ERROR",
      requestId: 1,
      code: "CLASSIC_SHARD_COMPUTE_FAILED",
      message: "boom",
    });
    if (failureMode === "onerror") workers[0]!.onerror?.(new Event("error") as ErrorEvent);
    if (failureMode === "onmessageerror") workers[0]!.onmessageerror?.(new MessageEvent("messageerror"));
    workers[1]!.resolve(1);

    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ type: "ERROR", revision: 60 });
    expect(workers.map(({ terminateCalls }) => terminateCalls)).toEqual([1, 1]);
  });

  it("turns a constructor failure into one complete pool failure", () => {
    const timers = new FakeTimers();
    const workers = [new FakeShardWorker()];
    const responses: AcousticWorkerResponse[] = [];
    let attempts = 0;
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        attempts += 1;
        if (attempts === 2) throw new Error("constructor failed");
        return workers[0]!;
      },
      hardwareConcurrency: 8,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => responses.push(event.data);

    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(2, 70) });
    expect(() => timers.flush()).not.toThrow();

    expect(responses).toEqual([expect.objectContaining({ type: "ERROR", revision: 70 })]);
    expect(workers[0]!.terminateCalls).toBe(1);
  });

  it("fails the complete pool when frame assembly throws", () => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const responses: AcousticWorkerResponse[] = [];
    const pool = createClassicSourcePool({
      assembleFrame: () => {
        throw new Error("assembly failed");
      },
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 8,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => responses.push(event.data);
    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(2, 80) });
    timers.flush();

    workers.forEach((worker) => worker.resolve(1));

    expect(responses).toEqual([expect.objectContaining({ type: "ERROR", revision: 80 })]);
    expect(workers.map(({ terminateCalls }) => terminateCalls)).toEqual([1, 1]);
  });

  it("disposes every worker exactly once and ignores late work", () => {
    const timers = new FakeTimers();
    const workers: FakeShardWorker[] = [];
    const responses: AcousticWorkerResponse[] = [];
    const pool = createClassicSourcePool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => {
        const worker = new FakeShardWorker();
        workers.push(worker);
        return worker;
      },
      hardwareConcurrency: 8,
      schedule: timers.schedule,
    });
    pool.onmessage = (event) => responses.push(event.data);
    pool.postMessage({ type: "UPDATE_SCENE", scene: sceneWithSources(2, 90) });
    timers.flush();

    const late = workers.map((worker) => worker.shardResponse(1));
    pool.postMessage({ type: "DISPOSE" });
    pool.terminate();
    workers.forEach((worker, index) => worker.emit(late[index]!));
    timers.flush();

    expect(workers.map(({ terminateCalls }) => terminateCalls)).toEqual([1, 1]);
    expect(workers.map((worker) => worker.posted.at(-1)?.type)).toEqual(["DISPOSE", "DISPOSE"]);
    expect(responses).toEqual([]);
  });
});
