import { describe, expect, it } from "vitest";

import {
  compileHybridGeometry,
  type HybridGeometry,
} from "@/acoustics/hybrid3d/compile";
import {
  computeHybridDirectFrame,
  computeHybridDirectSources,
} from "@/acoustics/hybrid3d/direct";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { HARD_ROOM_PRESET } from "@/domain/presets/hard-room";
import { createSceneDocumentV2 } from "@/domain/scene-document/serialize";
import type { SceneDocumentV2 } from "@/domain/scene-document/types";
import type { SceneSpec } from "@/domain/scene/types";
import {
  createHybridDirectPool,
  type HybridDirectPoolResult,
  type HybridDirectPoolWorkerLike,
} from "@/workers/hybrid-direct-pool";
import type {
  HybridDirectWorkerRequest,
  HybridDirectWorkerResponse,
} from "@/workers/hybrid-direct.worker";

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

  size(): number {
    return this.callbacks.size;
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
}

class FakeShardWorker implements HybridDirectPoolWorkerLike {
  readonly posted: HybridDirectWorkerRequest[] = [];
  onerror: ((event: ErrorEvent) => unknown) | null = null;
  onmessage: ((event: MessageEvent<HybridDirectWorkerResponse>) => unknown) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => unknown) | null = null;
  terminateCalls = 0;
  private readonly acknowledgedInstalls = new Set<number>();

  postMessage(request: HybridDirectWorkerRequest): void {
    this.posted.push(request);
  }

  terminate(): void {
    this.terminateCalls += 1;
  }

  emit(response: unknown): void {
    this.onmessage?.({ data: response } as MessageEvent<HybridDirectWorkerResponse>);
  }

  shardResponse(computeMs = 1): Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }> {
    const install = this.posted.findLast(
      (request): request is Extract<HybridDirectWorkerRequest, { type: "INSTALL_STATIC" }> =>
        request.type === "INSTALL_STATIC",
    );
    const compute = this.posted.findLast(
      (request): request is Extract<HybridDirectWorkerRequest, { type: "COMPUTE_SHARD" }> =>
        request.type === "COMPUTE_SHARD",
    );
    if (!install || !compute) throw new Error("No pending Hybrid shard");
    return {
      type: "SHARD_RESULT",
      requestId: compute.requestId,
      staticFingerprint: compute.staticFingerprint,
      revision: compute.snapshot.revision,
      sourceIds: compute.sourceIds,
      results: computeHybridDirectSources(compute.snapshot, install.structure.bvh, compute.sourceIds),
      computeMs,
      completedAtMs: 0,
    };
  }

  resolve(computeMs = 1): void {
    this.ackInstall();
    this.emit(this.shardResponse(computeMs));
  }

  ackInstall(): void {
    const install = this.posted.findLast(
      (request): request is Extract<HybridDirectWorkerRequest, { type: "INSTALL_STATIC" }> =>
        request.type === "INSTALL_STATIC",
    );
    if (!install || this.acknowledgedInstalls.has(install.requestId)) return;
    this.acknowledgedInstalls.add(install.requestId);
    this.emit({
      type: "STATIC_INSTALLED",
      requestId: install.requestId,
      staticFingerprint: install.structure.staticGeometryHash,
    });
  }
}

function documentWithSources(count: number, revision = 1): SceneDocumentV2 {
  const scene: SceneSpec = structuredClone(CONCRETE_PARTITION_PRESET);
  scene.revision = revision;
  scene.sources = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(CONCRETE_PARTITION_PRESET.sources[index % 2]!),
    id: `source-${index}`,
    name: `Source ${index}`,
    position: { x: 7.5 + index * 0.4, y: 1 + index * 0.5 },
  }));
  return createSceneDocumentV2(scene, {
    spatial3d: {
      coordinateSystem: "x-right-y-up-z-forward",
      floorElevationM: 0,
      listenerHeightM: 1.5,
      sourceHeightsM: Object.fromEntries(scene.sources.map(({ id }, index) => [id, 1.2 + index * 0.1])),
    },
  });
}

function pair(count: number, revision = 1): readonly [SceneDocumentV2, HybridGeometry] {
  const document = documentWithSources(count, revision);
  return [document, compileHybridGeometry(document)];
}

function reflectionPair(revision = 1): readonly [SceneDocumentV2, HybridGeometry] {
  const scene = structuredClone(HARD_ROOM_PRESET);
  scene.revision = revision;
  const document = createSceneDocumentV2(scene, {
    spatial3d: {
      coordinateSystem: "x-right-y-up-z-forward",
      floorElevationM: 0,
      listenerHeightM: 1.5,
      sourceHeightsM: { hard_radio: 1.2 },
    },
  });
  return [document, compileHybridGeometry(document)];
}

function reflectionPairWithBlockedFloorLeg(revision = 1): readonly [SceneDocumentV2, HybridGeometry] {
  const scene = structuredClone(HARD_ROOM_PRESET);
  scene.revision = revision;
  const document = createSceneDocumentV2(scene, {
    spatial3d: {
      coordinateSystem: "x-right-y-up-z-forward",
      floorElevationM: 0,
      listenerHeightM: 1.5,
      sourceHeightsM: { hard_radio: 1.2 },
      primitives: [{
        id: "low_blocker",
        name: "Low Blocker",
        kind: "box",
        position: { x: 6, y: 0.4, z: 4 },
        dimensions: { x: 0.3, y: 0.8, z: 1 },
        rotationYDeg: 0,
        materialId: "concrete_hard",
      }],
    },
  });
  return [document, compileHybridGeometry(document)];
}

function createHarness(hardwareConcurrency = 8) {
  const timers = new FakeTimers();
  const workers: FakeShardWorker[] = [];
  const results: HybridDirectPoolResult[] = [];
  let nowMs = 0;
  const pool = createHybridDirectPool({
    cancel: (timer) => timers.cancel(timer as number),
    createWorker: () => {
      const worker = new FakeShardWorker();
      workers.push(worker);
      return worker;
    },
    hardwareConcurrency,
    now: () => nowMs,
    schedule: timers.schedule,
  });
  pool.onresult = (result) => results.push(result);
  return { pool, results, timers, workers, setNow: (value: number) => { nowMs = value; } };
}

describe("Hybrid direct Worker pool", () => {
  it.each([1, 2, 4])("dispatches %s independent source shards before resolution", (sourceCount) => {
    const { pool, timers, workers } = createHarness();
    const [document, geometry] = pair(sourceCount);

    pool.update(document, geometry);
    timers.flush();

    expect(workers).toHaveLength(sourceCount);
    expect(workers.map((worker) => worker.posted.at(-1))).toEqual(
      Array.from({ length: sourceCount }, (_, index) => expect.objectContaining({
        type: "COMPUTE_SHARD",
        sourceIds: [`source-${index}`],
      })),
    );
  });

  it("round-robins authored sources at bounded capacity and merges reverse completion exactly", () => {
    const { pool, results, setNow, timers, workers } = createHarness(4);
    const [document, geometry] = pair(4, 12);

    pool.update(document, geometry);
    timers.flush();
    expect(workers.map((worker) => worker.posted.at(-1))).toEqual([
      expect.objectContaining({ type: "COMPUTE_SHARD", sourceIds: ["source-0", "source-2"] }),
      expect.objectContaining({ type: "COMPUTE_SHARD", sourceIds: ["source-1", "source-3"] }),
    ]);
    workers[1]!.resolve(7);
    setNow(20);
    workers[0]!.resolve(3);

    expect(results).toEqual([{
      frame: computeHybridDirectFrame(geometry, 20),
      source: "worker",
      notice: null,
      metrics: {
        computeMs: 20,
        completedAtMs: 20,
        requestSequence: 1,
        workerCount: 2,
        sourceComputeMsMax: 7,
        sourceComputeMsTotal: 10,
      },
    }]);
    expect(results[0]!.frame.paths.map(({ sourceId }) => sourceId)).toEqual([
      "source-0", "source-1", "source-2", "source-3",
    ]);
    expect(Object.keys(results[0]!.frame.firstOrderReflectionsBySource)).toEqual([
      "source-0", "source-1", "source-2", "source-3",
    ]);
  });

  it("persists Workers across source addition and removal without duplicate or missing results", () => {
    const { pool, results, timers, workers } = createHarness();
    for (const [count, revision] of [[1, 20], [4, 21], [2, 22]] as const) {
      const [document, geometry] = pair(count, revision);
      pool.update(document, geometry);
      timers.flush();
      workers.slice(0, count).forEach((worker) => worker.resolve());
    }

    expect(workers).toHaveLength(4);
    expect(results.map(({ frame }) => frame.paths.map(({ sourceId }) => sourceId))).toEqual([
      ["source-0"],
      ["source-0", "source-1", "source-2", "source-3"],
      ["source-0", "source-1"],
    ]);
  });

  it("does not reinstall pose-only geometry and installs every static fingerprint change before compute", () => {
    const { pool, timers, workers } = createHarness();
    const initialDocument = documentWithSources(2, 30);
    const initialGeometry = compileHybridGeometry(initialDocument);
    pool.update(initialDocument, initialGeometry);
    timers.flush();
    workers.forEach((worker) => worker.resolve());

    const moved = structuredClone(initialDocument);
    moved.baseScene.revision = 31;
    moved.baseScene.listener.position.x += 0.2;
    (moved.extensions.spatial3d as unknown as { listenerHeightM: number }).listenerHeightM += 0.1;
    const movedGeometry = compileHybridGeometry(moved);
    pool.update(moved, movedGeometry);
    timers.flush();
    expect(workers.map((worker) => worker.posted.filter(({ type }) => type === "INSTALL_STATIC").length)).toEqual([1, 1]);
    workers.forEach((worker) => worker.resolve());

    const mutations: Array<(document: SceneDocumentV2) => void> = [
      (document) => { document.baseScene.walls[0]!.a.x += 0.1; },
      (document) => { document.baseScene.portals[0]!.open = !document.baseScene.portals[0]!.open; },
      (document) => { document.baseScene.walls[0]!.materialId = "wood_medium"; },
      (document) => { (document.extensions.spatial3d as unknown as {
        wallVerticalBoundsM: Record<string, { bottomM: number; topM: number }>;
      }).wallVerticalBoundsM = { partition_center: { bottomM: 0.1, topM: 2.7 } }; },
      (document) => { (document.extensions.spatial3d as unknown as {
        primitives: Array<{
          id: string;
          name: string;
          kind: "box";
          position: { x: number; y: number; z: number };
          dimensions: { x: number; y: number; z: number };
          rotationYDeg: number;
          materialId: string;
        }>;
      }).primitives = [{
        id: "box-1",
        name: "Box",
        kind: "box",
        position: { x: 2, y: 1, z: 2 },
        dimensions: { x: 1, y: 1, z: 1 },
        rotationYDeg: 0,
        materialId: "wood_medium",
      }]; },
    ];
    let previous = moved;
    for (const [index, mutate] of mutations.entries()) {
      const changed = structuredClone(previous);
      changed.baseScene.revision = 32 + index;
      mutate(changed);
      const geometry = compileHybridGeometry(changed);
      pool.update(changed, geometry);
      timers.flush();
      expect(workers.map((worker) => worker.posted.slice(-2).map(({ type }) => type))).toEqual([
        ["INSTALL_STATIC", "COMPUTE_SHARD"],
        ["INSTALL_STATIC", "COMPUTE_SHARD"],
      ]);
      workers.forEach((worker) => worker.resolve());
      previous = changed;
    }
  });

  it("suppresses an obsolete in-flight frame and publishes only the newest pending identity", () => {
    const { pool, results, timers, workers } = createHarness();
    const first = pair(2, 40);
    const intermediate = pair(2, 41);
    const latest = pair(2, 42);
    pool.update(...first);
    timers.flush();
    pool.update(...intermediate);
    pool.update(...latest);
    timers.flush();

    workers.forEach((worker) => worker.resolve());
    expect(results).toEqual([]);
    timers.flush();
    workers.forEach((worker) => worker.resolve());
    expect(results).toHaveLength(1);
    expect(results[0]!.frame).toMatchObject({
      revision: 42,
      classicProjectionHash: latest[0].compatibility.classicProjectionHash,
    });
  });

  it("rejects a document paired with geometry compiled for a different document", () => {
    const { pool, results, timers, workers } = createHarness();
    const [document, geometry] = pair(2, 45);
    const differentDocument = structuredClone(document);

    pool.update(differentDocument, geometry);
    timers.flush();

    expect(workers).toEqual([]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: "fallback", frame: { revision: 45 } });
  });

  it("enforces the bounded acoustic cadence without blocking later UI updates", () => {
    const timeline = new FakeTimeline();
    const workers: FakeShardWorker[] = [];
    const pool = createHybridDirectPool({
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
    const first = pair(1, 46);
    first[0].baseScene.settings.acousticUpdateHz = 15;
    pool.update(...first);
    timeline.advance(0);
    workers[0]!.resolve();

    const latest = pair(1, 47);
    latest[0].baseScene.settings.acousticUpdateHz = 10;
    pool.update(...latest);
    timeline.advance(99);
    expect(workers[0]!.posted.filter(({ type }) => type === "COMPUTE_SHARD")).toHaveLength(1);
    timeline.advance(1);
    expect(workers[0]!.posted.filter(({ type }) => type === "COMPUTE_SHARD")).toHaveLength(2);
  });

  it.each([
    ["request ID", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, requestId: response.requestId + 1 })],
    ["malformed request ID", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, requestId: null })],
    ["fingerprint", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, staticFingerprint: "wrong" })],
    ["revision", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, revision: response.revision + 1 })],
    ["source assignment", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, sourceIds: ["wrong"] })],
    ["non-array source assignment", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, sourceIds: null })],
    ["null results", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: null })],
    ["null result", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: [null] })],
    ["null path", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: [{ ...response.results[0], path: null }] })],
    ["malformed path", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: [{ ...response.results[0], path: { ...response.results[0]!.path, hits: null } }] })],
    ["null reflections", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: [{ ...response.results[0], firstOrderReflections: null }] })],
    ["malformed reflection", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: [{ ...response.results[0], firstOrderReflections: [null] }] })],
    ["projection hash", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: [{ ...response.results[0], classicProjectionHash: "wrong" }] })],
    ["non-finite timing", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, computeMs: Number.NaN })],
    ["non-finite completion timing", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, completedAtMs: Number.POSITIVE_INFINITY })],
    ["wrong shard count", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({ ...response, results: [] })],
  ] as const)("fails closed on a malformed %s", (_, alter) => {
    const { pool, results, timers, workers } = createHarness();
    const current = pair(2, 50);
    pool.update(...current);
    timers.flush();

    workers[0]!.emit(alter(workers[0]!.shardResponse()) as unknown);
    workers[1]!.resolve();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: "fallback",
      frame: {
        revision: 50,
        classicProjectionHash: current[0].compatibility.classicProjectionHash,
      },
    });
    expect(workers.map(({ terminateCalls }) => terminateCalls)).toEqual([1, 1]);
  });

  it.each([
    ["negative distance", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{ ...response.results[0], path: { ...response.results[0]!.path, distanceM: -1 } }],
    })],
    ["non-unit direction", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{ ...response.results[0], path: { ...response.results[0]!.path, directionToSource: { x: 2, y: 0, z: 0 } } }],
    })],
    ["inconsistent direct route", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{ ...response.results[0], path: { ...response.results[0]!.path, routeType: "direct", directVisible: false } }],
    })],
    ["unknown hit patch", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        path: {
          ...response.results[0]!.path,
          routeType: "blocked",
          directVisible: false,
          occluderWallIds: ["unknown"],
          hits: [{
            patchId: "unknown",
            surfaceId: "unknown",
            materialId: "concrete_hard",
            thicknessM: 0.1,
            distanceM: 1,
            point: { x: 1, y: 1, z: 1 },
          }],
        },
      }],
    })],
    ["negative reflection delay", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        firstOrderReflections: [{
          ...(response.results[0]!.firstOrderReflections[0] ?? {
            id: "first:floor",
            surfaceId: "floor",
            patchId: "floor",
            materialId: "concrete_hard",
            reflectionPoint: { x: 1, y: 0, z: 1 },
            pathLengthM: 2,
            excessDelayMs: 1,
            arrivalDirection: { x: 1, y: 0, z: 0 },
          }),
          delayMs: -0.1,
        }],
      }],
    })],
  ] as const)("fails closed on finite but invalid %s", (_, alter) => {
    const { pool, results, timers, workers } = createHarness(1);
    const current = pair(1, 52);
    pool.update(...current);
    timers.flush();
    workers[0]!.ackInstall();

    workers[0]!.emit(alter(workers[0]!.shardResponse()) as unknown);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: "fallback", frame: { revision: 52 } });
    expect(workers[0]!.terminateCalls).toBe(1);
  });

  it.each([
    ["distance", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{ ...response.results[0], path: { ...response.results[0]!.path, distanceM: response.results[0]!.path.distanceM + 0.25 } }],
    })],
    ["delay", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{ ...response.results[0], path: { ...response.results[0]!.path, delayMs: response.results[0]!.path.delayMs + 0.5 } }],
    })],
    ["direction", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => {
      const direction = response.results[0]!.path.directionToSource;
      const inverted = { x: -direction.x, y: -direction.y, z: -direction.z };
      return {
        ...response,
        results: [{
          ...response.results[0],
          path: {
            ...response.results[0]!.path,
            directionToSource: inverted,
            propagationDirection: direction,
          },
        }],
      };
    }],
    ["azimuth", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        path: {
          ...response.results[0]!.path,
          azimuthDeg: response.results[0]!.path.azimuthDeg > 170
            ? response.results[0]!.path.azimuthDeg - 5
            : response.results[0]!.path.azimuthDeg + 5,
        },
      }],
    })],
    ["reflection path length", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        firstOrderReflections: response.results[0]!.firstOrderReflections.map((reflection, index) =>
          index === 0 ? { ...reflection, pathLengthM: reflection.pathLengthM + 0.25 } : reflection),
      }],
    })],
    ["reflection delay", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        firstOrderReflections: response.results[0]!.firstOrderReflections.map((reflection, index) =>
          index === 0 ? { ...reflection, delayMs: reflection.delayMs + 0.5 } : reflection),
      }],
    })],
    ["reflection arrival direction", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => ({
      ...response,
      results: [{
        ...response.results[0],
        firstOrderReflections: response.results[0]!.firstOrderReflections.map((reflection, index) =>
          index === 0
            ? {
                ...reflection,
                arrivalDirection: {
                  x: -reflection.arrivalDirection.x,
                  y: -reflection.arrivalDirection.y,
                  z: -reflection.arrivalDirection.z,
                },
              }
            : reflection),
      }],
    })],
    ["non-specular reflection point", (response: Extract<HybridDirectWorkerResponse, { type: "SHARD_RESULT" }>) => {
      const directDistanceM = response.results[0]!.path.distanceM;
      return {
        ...response,
        results: [{
          ...response.results[0],
          firstOrderReflections: response.results[0]!.firstOrderReflections.map((reflection, index) => {
            if (index !== 0) return reflection;
            const point = { ...reflection.reflectionPoint, x: reflection.reflectionPoint.x + 0.1 };
            const source = { x: 7.5, y: 1.2, z: 4 };
            const listener = { x: 3, y: 1.5, z: 4 };
            const pathLengthM = Math.hypot(source.x - point.x, source.y - point.y, source.z - point.z)
              + Math.hypot(point.x - listener.x, point.y - listener.y, point.z - listener.z);
            const arrival = {
              x: point.x - listener.x,
              y: point.y - listener.y,
              z: point.z - listener.z,
            };
            const arrivalLength = Math.hypot(arrival.x, arrival.y, arrival.z);
            return {
              ...reflection,
              reflectionPoint: point,
              pathLengthM,
              delayMs: (pathLengthM / 343) * 1_000,
              excessDelayMs: ((pathLengthM - directDistanceM) / 343) * 1_000,
              arrivalDirection: {
                x: arrival.x / arrivalLength,
                y: arrival.y / arrivalLength,
                z: arrival.z / arrivalLength,
              },
            };
          }),
        }],
      };
    }],
  ] as const)("falls back on plausible but inconsistent %s", (_, alter) => {
    const { pool, results, timers, workers } = createHarness(1);
    const current = reflectionPair(54);
    pool.update(...current);
    timers.flush();
    workers[0]!.ackInstall();
    const valid = workers[0]!.shardResponse();
    expect(valid.results[0]!.firstOrderReflections.length).toBeGreaterThan(0);

    workers[0]!.emit(alter(valid) as unknown);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: "fallback", frame: { revision: 54 } });
    expect(workers[0]!.terminateCalls).toBe(1);
  });

  it.each(["blocked reflection leg", "duplicate physical surface"] as const)(
    "falls back on a forged %s",
    (scenario) => {
      const { pool, results, timers, workers } = createHarness(1);
      const current = scenario === "blocked reflection leg"
        ? reflectionPairWithBlockedFloorLeg(56)
        : reflectionPair(56);
      pool.update(...current);
      timers.flush();
      workers[0]!.ackInstall();
      const response = workers[0]!.shardResponse();
      const reference = computeHybridDirectFrame(reflectionPair(56)[1])
        .firstOrderReflectionsBySource.hard_radio!;
      const forgedTap = scenario === "duplicate physical surface"
        ? response.results[0]!.firstOrderReflections[0]!
        : reference.find(({ surfaceId }) => surfaceId === "floor")!;
      expect(forgedTap).toBeDefined();
      if (scenario === "blocked reflection leg") {
        expect(response.results[0]!.firstOrderReflections.map(({ surfaceId }) => surfaceId))
          .not.toContain("floor");
      }

      workers[0]!.emit({
        ...response,
        results: [{
          ...response.results[0],
          firstOrderReflections: [...response.results[0]!.firstOrderReflections, forgedTap],
        }],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ source: "fallback", frame: { revision: 56 } });
      expect(workers[0]!.terminateCalls).toBe(1);
    },
  );

  it("fails closed on an unexpected or duplicate static acknowledgement", () => {
    for (const mode of ["unexpected", "duplicate"] as const) {
      const { pool, results, timers, workers } = createHarness(1);
      const initial = pair(1, 53);
      pool.update(...initial);
      timers.flush();
      workers[0]!.ackInstall();
      if (mode === "unexpected") {
        workers[0]!.resolve();
        const movedDocument = structuredClone(initial[0]);
        movedDocument.baseScene.revision = 54;
        movedDocument.baseScene.listener.position.x += 0.1;
        const movedGeometry = compileHybridGeometry(movedDocument);
        pool.update(movedDocument, movedGeometry);
        timers.flush();
        const compute = workers[0]!.posted.at(-1)! as Extract<HybridDirectWorkerRequest, { type: "COMPUTE_SHARD" }>;
        workers[0]!.emit({
          type: "STATIC_INSTALLED",
          requestId: compute.requestId,
          staticFingerprint: compute.staticFingerprint,
        });
      } else {
        const install = workers[0]!.posted[0]! as Extract<HybridDirectWorkerRequest, { type: "INSTALL_STATIC" }>;
        workers[0]!.emit({
          type: "STATIC_INSTALLED",
          requestId: install.requestId,
          staticFingerprint: install.structure.staticGeometryHash,
        });
      }
      expect(results.at(-1)).toMatchObject({ source: "fallback" });
      expect(workers[0]!.terminateCalls).toBe(1);
    }
  });

  it("times out a non-responsive job and cancels the watchdog on completion", () => {
    const cadence = new FakeTimers();
    const watchdog = new FakeTimeline();
    const workers: FakeShardWorker[] = [];
    const results: HybridDirectPoolResult[] = [];
    const pool = createHybridDirectPool({
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
    pool.onresult = (result) => results.push(result);
    const current = pair(1, 55);
    pool.update(...current);
    cadence.flush();
    watchdog.advance(24);
    expect(results).toEqual([]);
    watchdog.advance(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: "fallback", frame: { revision: 55 } });
    expect(workers[0]!.terminateCalls).toBe(1);

    const completedCadence = new FakeTimers();
    const completedWatchdog = new FakeTimeline();
    const completedWorkers: FakeShardWorker[] = [];
    const completedResults: HybridDirectPoolResult[] = [];
    const completedPool = createHybridDirectPool({
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
    completedPool.onresult = (result) => completedResults.push(result);
    completedPool.update(...pair(1, 56));
    completedCadence.flush();
    completedWorkers[0]!.resolve();
    completedWatchdog.advance(25);
    expect(completedResults).toHaveLength(1);
    expect(completedResults[0]).toMatchObject({ source: "worker", frame: { revision: 56 } });

    const disposedCadence = new FakeTimers();
    const disposedWatchdog = new FakeTimeline();
    const disposedWorkers: FakeShardWorker[] = [];
    const disposedResults: HybridDirectPoolResult[] = [];
    const disposedPool = createHybridDirectPool({
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
    disposedPool.onresult = (result) => disposedResults.push(result);
    disposedPool.update(...pair(1, 57));
    disposedCadence.flush();
    disposedPool.dispose();
    disposedWatchdog.advance(25);
    expect(disposedResults).toEqual([]);
    expect(disposedWorkers[0]!.terminateCalls).toBe(1);
  });

  it.each(["typed", "onerror", "onmessageerror"] as const)("fails once and activates complete fallback on %s", (mode) => {
    const { pool, results, timers, workers } = createHarness();
    const current = pair(2, 60);
    pool.update(...current);
    timers.flush();
    if (mode === "typed") workers[0]!.emit({
      type: "ERROR",
      requestId: 1,
      code: "HYBRID_SHARD_COMPUTE_FAILED",
      message: "boom",
    });
    if (mode === "onerror") workers[0]!.onerror?.(new Event("error") as ErrorEvent);
    if (mode === "onmessageerror") workers[0]!.onmessageerror?.(new MessageEvent("messageerror"));
    workers[1]!.resolve();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: "fallback", notice: expect.stringContaining("fallback") });
    expect(results[0]!.frame).toEqual(computeHybridDirectFrame(current[1], 0));
    expect(workers.map(({ terminateCalls }) => terminateCalls)).toEqual([1, 1]);
  });

  it("falls back atomically to the newest pending geometry after an in-flight failure", () => {
    const { pool, results, timers, workers } = createHarness();
    const first = pair(2, 65);
    const latest = pair(2, 66);
    pool.update(...first);
    timers.flush();
    pool.update(...latest);

    workers[0]!.onerror?.(new Event("error") as ErrorEvent);
    workers[1]!.resolve();

    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe("fallback");
    expect(results[0]!.frame).toEqual(computeHybridDirectFrame(latest[1], 0));
  });

  it("stamps serial fallback frames at post-computation completion time", () => {
    const timers = new FakeTimers();
    const worker = new FakeShardWorker();
    const results: HybridDirectPoolResult[] = [];
    const times = [0, 10, 100, 125];
    const pool = createHybridDirectPool({
      cancel: (timer) => timers.cancel(timer as number),
      createWorker: () => worker,
      hardwareConcurrency: 1,
      now: () => times.shift() ?? 125,
      schedule: timers.schedule,
    });
    pool.onresult = (result) => results.push(result);
    const current = pair(1, 67);
    pool.update(...current);
    timers.flush();

    worker.onerror?.(new Event("error") as ErrorEvent);

    expect(results).toEqual([{
      frame: computeHybridDirectFrame(current[1], 125),
      source: "fallback",
      notice: "Hybrid Worker pool unavailable; using deterministic serial fallback.",
      metrics: {
        computeMs: 25,
        completedAtMs: 125,
        requestSequence: 2,
        workerCount: 0,
        sourceComputeMsMax: 0,
        sourceComputeMsTotal: 0,
      },
    }]);
  });

  it("turns constructor and assembly failures into one complete deterministic fallback", () => {
    for (const mode of ["constructor", "assembly"] as const) {
      const timers = new FakeTimers();
      const workers: FakeShardWorker[] = [];
      const results: HybridDirectPoolResult[] = [];
      let attempts = 0;
      const pool = createHybridDirectPool({
        assembleFrame: mode === "assembly" ? () => { throw new Error("assembly"); } : undefined,
        cancel: (timer) => timers.cancel(timer as number),
        createWorker: () => {
          attempts += 1;
          if (mode === "constructor" && attempts === 2) throw new Error("constructor");
          const worker = new FakeShardWorker();
          workers.push(worker);
          return worker;
        },
        hardwareConcurrency: 8,
        schedule: timers.schedule,
      });
      pool.onresult = (result) => results.push(result);
      const current = pair(2, 70);
      pool.update(...current);
      timers.flush();
      if (mode === "assembly") workers.forEach((worker) => worker.resolve());

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ source: "fallback", frame: { revision: 70 } });
      expect(workers.map(({ terminateCalls }) => terminateCalls)).toEqual(workers.map(() => 1));
    }
  });

  it("sends DISPOSE, terminates exactly once, cancels timers, and ignores late replies", () => {
    const { pool, results, timers, workers } = createHarness();
    const current = pair(2, 80);
    pool.update(...current);
    timers.flush();
    const late = workers.map((worker) => worker.shardResponse());
    pool.dispose();
    pool.dispose();
    workers.forEach((worker, index) => worker.emit(late[index]!));
    timers.flush();

    expect(timers.size()).toBe(0);
    expect(workers.map(({ terminateCalls }) => terminateCalls)).toEqual([1, 1]);
    expect(workers.map((worker) => worker.posted.at(-1)?.type)).toEqual(["DISPOSE", "DISPOSE"]);
    expect(results).toEqual([]);
  });
});
