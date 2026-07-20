import {
  assembleAcousticFrame,
  createClassicPoseSnapshot,
  createClassicStaticContext,
  type ClassicPoseSnapshot,
  type ClassicSourceResult,
  type AcousticFrame,
} from "@/acoustics/compute-frame";
import { estimateRoomAcoustics } from "@/acoustics/room-acoustics";
import type { RoomAcousticFrame } from "@/acoustics/types";
import { acousticUpdateIntervalMs } from "@/acoustics/update-rate";
import type { SceneSpec } from "@/domain/scene/types";
import type {
  AcousticWorkerRequest,
  AcousticWorkerResponse,
} from "@/workers/acoustics.worker";
import type {
  ClassicSourceWorkerRequest,
  ClassicSourceWorkerResponse,
} from "@/workers/classic-source.worker";
import { classicSourcePoolCapacity } from "@/workers/worker-pool-policy";

export type ClassicSourcePoolWorkerLike = {
  postMessage: (request: ClassicSourceWorkerRequest) => void;
  terminate: () => void;
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessage: ((event: MessageEvent<ClassicSourceWorkerResponse>) => unknown) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => unknown) | null;
};

export type ClassicSourcePoolLike = {
  postMessage: (request: AcousticWorkerRequest) => void;
  terminate: () => void;
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessage: ((event: MessageEvent<AcousticWorkerResponse>) => unknown) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => unknown) | null;
};

type ClassicSourcePoolOptions = Readonly<{
  assembleFrame?: (
    snapshot: ClassicPoseSnapshot,
    room: RoomAcousticFrame,
    results: readonly ClassicSourceResult[],
    generatedAtMs: number,
  ) => AcousticFrame;
  cancel?: (timer: unknown) => void;
  createWorker?: () => ClassicSourcePoolWorkerLike;
  hardwareConcurrency?: number;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
}>;

type InFlightJob = {
  requestId: number;
  startedAtMs: number;
  snapshot: ClassicPoseSnapshot;
  room: RoomAcousticFrame;
  assignments: readonly (readonly string[])[];
  resultsByWorker: Map<number, readonly ClassicSourceResult[]>;
  computeMsByWorker: Map<number, number>;
};

export function createClassicSourcePool(
  options: ClassicSourcePoolOptions = {},
): ClassicSourcePoolLike {
  const capacity = classicSourcePoolCapacity(options.hardwareConcurrency);
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const assembleFrame = options.assembleFrame ?? assembleAcousticFrame;
  const createWorker = options.createWorker ?? (() => new Worker(
    new URL("./classic-source.worker.ts", import.meta.url),
  ) as ClassicSourcePoolWorkerLike);
  const now = options.now ?? Date.now;
  const workers: ClassicSourcePoolWorkerLike[] = [];
  const installedFingerprints: (string | null)[] = [];
  let pendingScene: SceneSpec | null = null;
  let timer: unknown | null = null;
  let requestId = 0;
  let inFlight: InFlightJob | null = null;
  let lastFrameAtMs = Number.NEGATIVE_INFINITY;
  let latestRevision = 0;
  let stopped = false;

  const facade: ClassicSourcePoolLike = {
    onerror: null,
    onmessage: null,
    onmessageerror: null,
    postMessage(request): void {
      if (stopped) return;
      if (request.type === "DISPOSE") {
        stop(true);
        return;
      }
      latestRevision = request.scene.revision;
      pendingScene = request.scene;
      if (!inFlight && timer !== null) {
        cancel(timer);
        timer = null;
      }
      schedulePending();
    },
    terminate(): void {
      stop(true);
    },
  };

  const terminateWorkers = (postDispose: boolean): void => {
    for (const worker of workers) {
      if (postDispose) {
        try {
          worker.postMessage({ type: "DISPOSE", requestId: ++requestId });
        } catch {
          // Termination still guarantees release if a Worker cannot accept DISPOSE.
        }
      }
      worker.terminate();
    }
  };

  const stop = (postDispose: boolean): void => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) cancel(timer);
    timer = null;
    pendingScene = null;
    inFlight = null;
    terminateWorkers(postDispose);
  };

  const fail = (error: unknown): void => {
    if (stopped) return;
    const revision = inFlight?.snapshot.revision ?? pendingScene?.revision ?? latestRevision;
    stop(false);
    facade.onmessage?.({
      data: {
        type: "ERROR",
        revision,
        code: "CLASSIC_POOL_FAILED",
        message: error instanceof Error ? error.message : "Classic source Worker pool failed.",
      },
    } as MessageEvent<AcousticWorkerResponse>);
  };

  const schedulePending = (): void => {
    if (stopped || !pendingScene || inFlight || timer !== null) return;
    const delayMs = Math.max(
      0,
      lastFrameAtMs + acousticUpdateIntervalMs(pendingScene.settings.acousticUpdateHz) - now(),
    );
    timer = schedule(() => {
      timer = null;
      const scene = pendingScene;
      pendingScene = null;
      if (!stopped && scene) dispatch(scene);
    }, delayMs);
  };

  const finishIfComplete = (): void => {
    const job = inFlight;
    if (!job || job.resultsByWorker.size !== job.assignments.length) return;
    try {
      const completedAtMs = now();
      const frame = assembleFrame(
        job.snapshot,
        job.room,
        job.assignments.flatMap((_, index) => job.resultsByWorker.get(index) ?? []),
        job.startedAtMs,
      );
      const sourceComputeTimes = [...job.computeMsByWorker.values()];
      const response: AcousticWorkerResponse = {
        type: "FRAME",
        revision: frame.revision,
        frame,
        metrics: {
          computeMs: completedAtMs - job.startedAtMs,
          completedAtMs,
          workerCount: job.assignments.length,
          sourceComputeMsMax: Math.max(0, ...sourceComputeTimes),
          sourceComputeMsTotal: sourceComputeTimes.reduce((total, value) => total + value, 0),
        },
      };
      const obsolete = pendingScene !== null;
      lastFrameAtMs = completedAtMs;
      inFlight = null;
      if (!obsolete) facade.onmessage?.({ data: response } as MessageEvent<AcousticWorkerResponse>);
      schedulePending();
    } catch (error) {
      fail(error);
    }
  };

  const sameSourceIds = (left: readonly string[], right: readonly string[]): boolean =>
    left.length === right.length && left.every((sourceId, index) => sourceId === right[index]);

  const handleWorkerResponse = (workerIndex: number, response: ClassicSourceWorkerResponse): void => {
    if (stopped) return;
    const job = inFlight;
    if (!job) {
      fail(new Error("Classic source Worker responded without an in-flight job."));
      return;
    }
    if (response.type === "ERROR") {
      fail(new Error(response.message));
      return;
    }
    if (
      response.requestId !== job.requestId
      || response.staticFingerprint !== job.snapshot.staticFingerprint
    ) {
      fail(new Error("Classic source Worker response identity mismatch."));
      return;
    }
    if (response.type === "STATIC_INSTALLED") return;
    const assignment = job.assignments[workerIndex];
    if (
      !assignment
      || response.revision !== job.snapshot.revision
      || !sameSourceIds(response.sourceIds, assignment)
      || job.resultsByWorker.has(workerIndex)
      || !Number.isFinite(response.computeMs)
      || response.computeMs < 0
      || response.results.length !== assignment.length
      || response.results.some((result, index) =>
        result.sourceId !== assignment[index]
        || result.revision !== job.snapshot.revision
        || result.staticFingerprint !== job.snapshot.staticFingerprint
        || result.frame.sourceId !== assignment[index])
    ) {
      fail(new Error("Classic source Worker returned a malformed shard."));
      return;
    }
    job.resultsByWorker.set(workerIndex, response.results);
    job.computeMsByWorker.set(workerIndex, response.computeMs);
    finishIfComplete();
  };

  const dispatch = (scene: SceneSpec): void => {
    const startedAtMs = now();
    try {
      const activeCount = Math.min(scene.sources.length, capacity);
      while (workers.length < activeCount) {
        const worker = createWorker();
        const workerIndex = workers.length;
        worker.onmessage = (event) => handleWorkerResponse(workerIndex, event.data);
        worker.onerror = () => fail(new Error("Classic source Worker error."));
        worker.onmessageerror = () => fail(new Error("Classic source Worker message error."));
        workers.push(worker);
        installedFingerprints.push(null);
      }
      const context = createClassicStaticContext(scene);
      const snapshot = createClassicPoseSnapshot(scene);
      const nextRequestId = ++requestId;
      const assignments = Array.from({ length: activeCount }, (_, index) => scene.sources
        .filter((_, sourceIndex) => sourceIndex % activeCount === index)
        .map(({ id }) => id));
      inFlight = {
        requestId: nextRequestId,
        startedAtMs,
        snapshot,
        room: estimateRoomAcoustics(scene),
        assignments,
        resultsByWorker: new Map(),
        computeMsByWorker: new Map(),
      };
      if (activeCount === 0) {
        finishIfComplete();
        return;
      }
      for (let index = 0; index < activeCount; index += 1) {
        const worker = workers[index]!;
        if (installedFingerprints[index] !== context.fingerprint) {
          worker.postMessage({ type: "INSTALL_STATIC", requestId: nextRequestId, context });
          installedFingerprints[index] = context.fingerprint;
        }
        worker.postMessage({
          type: "COMPUTE_SHARD",
          requestId: nextRequestId,
          staticFingerprint: context.fingerprint,
          snapshot,
          sourceIds: assignments[index]!,
        });
      }
    } catch (error) {
      fail(error);
    }
  };

  return facade;
}
