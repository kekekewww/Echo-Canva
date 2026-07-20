import {
  assembleAcousticFrame,
  createClassicPoseSnapshot,
  createClassicStaticContext,
  type ClassicPoseSnapshot,
  type ClassicSourceResult,
  type ClassicStaticContext,
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
  cancelWatchdog?: (timer: unknown) => void;
  createWorker?: () => ClassicSourcePoolWorkerLike;
  hardwareConcurrency?: number;
  jobTimeoutMs?: number;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  scheduleWatchdog?: (callback: () => void, delayMs: number) => unknown;
}>;

type InFlightJob = {
  requestId: number;
  startedAtMs: number;
  snapshot: ClassicPoseSnapshot;
  room: RoomAcousticFrame;
  assignments: readonly (readonly string[])[];
  resultsByWorker: Map<number, readonly ClassicSourceResult[]>;
  computeMsByWorker: Map<number, number>;
  expectedStaticAcks: Set<number>;
  watchdog: unknown | null;
  context: ClassicStaticContext;
};

const DEFAULT_JOB_TIMEOUT_MS = 2_000;
const MAX_ID_LENGTH = 64;
const MAX_COORDINATE_M = 100;
const MAX_PHYSICAL_DISTANCE_M = 150;
const MAX_EFFECTIVE_DISTANCE_M = 1_600;
const MAX_CLASSIC_ROUTE_POINTS = 10;
const MAX_CLASSIC_REFLECTIONS = 6;
const MAX_EARLY_DELAY_MS = 80;
const MAX_TIMING_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isBoundedKnownStringArray(
  value: unknown,
  maximumLength: number,
  knownIds: ReadonlySet<string>,
): value is string[] {
  return Array.isArray(value)
    && value.length <= maximumLength
    && value.every((entry) => isBoundedString(entry) && knownIds.has(entry))
    && new Set(value).size === value.length;
}

function isVec2(value: unknown): boolean {
  return isRecord(value)
    && isBoundedNumber(value.x, -MAX_COORDINATE_M, MAX_COORDINATE_M)
    && isBoundedNumber(value.y, -MAX_COORDINATE_M, MAX_COORDINATE_M);
}

function isEarlyReflection(value: unknown, wallIds: ReadonlySet<string>): boolean {
  return isRecord(value)
    && isBoundedString(value.wallId)
    && wallIds.has(value.wallId)
    && isBoundedNumber(value.pathLengthM, 0, MAX_EFFECTIVE_DISTANCE_M)
    && isBoundedNumber(value.delayMs, 0, MAX_EARLY_DELAY_MS)
    && isBoundedNumber(value.gainDb, -120, 0)
    && isBoundedNumber(value.lowpassHz, 20, 20_000)
    && isVec2(value.reflectionPoint);
}

function isAcousticFrameSource(
  value: unknown,
  sourceId: string,
  context: ClassicStaticContext,
): boolean {
  if (!isRecord(value)) return false;
  const wallIds = new Set(context.scene.walls.map(({ id }) => id));
  const portalIds = new Set(context.scene.portals.map(({ id }) => id));
  const routeType = value.routeType;
  const directVisible = value.directVisible;
  if (!isBoundedKnownStringArray(value.occluderWallIds, 100, wallIds)) return false;
  if (!isBoundedKnownStringArray(value.portalIds, 8, portalIds)) return false;
  const routeConsistent = routeType === "direct"
    ? directVisible === true && value.occluderWallIds.length === 0 && value.portalIds.length === 0
    : routeType === "portal"
      ? directVisible === false && value.portalIds.length > 0
      : routeType === "blocked"
        ? directVisible === false && value.portalIds.length === 0
        : false;
  if (!isBoundedNumber(value.physicalDistanceM, 0, MAX_PHYSICAL_DISTANCE_M)) return false;
  const physicalDistanceM = value.physicalDistanceM;
  return routeConsistent
    && value.sourceId === sourceId
    && isBoundedNumber(value.effectiveDistanceM, physicalDistanceM, MAX_EFFECTIVE_DISTANCE_M)
    && (routeType === "portal" || Math.abs(value.effectiveDistanceM - physicalDistanceM) <= 1e-6)
    && isBoundedNumber(value.dryGainDb, -192, 0)
    && isBoundedNumber(value.lowpassHz, 20, 20_000)
    && isBoundedNumber(value.reverbSendDb, -120, 12)
    && isVec2(value.virtualPosition)
    && Array.isArray(value.routePolyline)
    && value.routePolyline.length >= 2
    && value.routePolyline.length <= MAX_CLASSIC_ROUTE_POINTS
    && value.routePolyline.every(isVec2)
    && Array.isArray(value.earlyReflections)
    && value.earlyReflections.length <= MAX_CLASSIC_REFLECTIONS
    && value.earlyReflections.every((reflection) => isEarlyReflection(reflection, wallIds));
}

function isClassicSourceResult(
  value: unknown,
  sourceId: string,
  revision: number,
  staticFingerprint: string,
  context: ClassicStaticContext,
): value is ClassicSourceResult {
  return isRecord(value)
    && value.sourceId === sourceId
    && value.revision === revision
    && value.staticFingerprint === staticFingerprint
    && isAcousticFrameSource(value.frame, sourceId, context);
}

export function createClassicSourcePool(
  options: ClassicSourcePoolOptions = {},
): ClassicSourcePoolLike {
  const capacity = classicSourcePoolCapacity(options.hardwareConcurrency);
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const scheduleWatchdog = options.scheduleWatchdog ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelWatchdog = options.cancelWatchdog ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const jobTimeoutMs = options.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
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

  const cancelJobWatchdog = (job: InFlightJob | null): void => {
    if (job?.watchdog !== null && job?.watchdog !== undefined) {
      cancelWatchdog(job.watchdog);
      job.watchdog = null;
    }
  };

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
    cancelJobWatchdog(inFlight);
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
          requestSequence: job.requestId,
        },
      };
      const obsolete = pendingScene !== null;
      lastFrameAtMs = completedAtMs;
      cancelJobWatchdog(job);
      inFlight = null;
      if (!obsolete) facade.onmessage?.({ data: response } as MessageEvent<AcousticWorkerResponse>);
      schedulePending();
    } catch (error) {
      fail(error);
    }
  };

  const sameSourceIds = (left: readonly string[], right: readonly string[]): boolean =>
    left.length === right.length && left.every((sourceId, index) => sourceId === right[index]);

  const handleWorkerResponse = (workerIndex: number, payload: unknown): void => {
    if (stopped) return;
    try {
      if (!isRecord(payload) || typeof payload.type !== "string") {
        throw new Error("Classic source Worker returned a malformed response.");
      }
      if (payload.type === "ERROR") {
        throw new Error(typeof payload.message === "string" ? payload.message : "Classic source Worker failed.");
      }
      const job = inFlight;
      if (!job) throw new Error("Classic source Worker responded without an in-flight job.");
      if (
        (payload.type !== "STATIC_INSTALLED" && payload.type !== "SHARD_RESULT")
        || payload.requestId !== job.requestId
        || payload.staticFingerprint !== job.snapshot.staticFingerprint
        || workerIndex >= job.assignments.length
      ) {
        throw new Error("Classic source Worker response identity mismatch.");
      }
      if (payload.type === "STATIC_INSTALLED") {
        if (!job.expectedStaticAcks.delete(workerIndex)) {
          throw new Error("Classic source Worker returned an unexpected static acknowledgement.");
        }
        return;
      }
      const assignment = job.assignments[workerIndex]!;
      if (
        job.expectedStaticAcks.has(workerIndex)
        ||
        payload.revision !== job.snapshot.revision
        || !Array.isArray(payload.sourceIds)
        || !payload.sourceIds.every(isBoundedString)
        || !sameSourceIds(payload.sourceIds, assignment)
        || job.resultsByWorker.has(workerIndex)
        || !isFiniteNumber(payload.computeMs)
        || !isBoundedNumber(payload.computeMs, 0, MAX_TIMING_MS)
        || !isBoundedNumber(payload.completedAtMs, 0, Number.MAX_SAFE_INTEGER)
        || !Array.isArray(payload.results)
        || payload.results.length !== assignment.length
        || !payload.results.every((result, index) => isClassicSourceResult(
          result,
          assignment[index]!,
          job.snapshot.revision,
          job.snapshot.staticFingerprint,
          job.context,
        ))
      ) {
        throw new Error("Classic source Worker returned a malformed shard.");
      }
      job.resultsByWorker.set(workerIndex, payload.results);
      job.computeMsByWorker.set(workerIndex, payload.computeMs);
      finishIfComplete();
    } catch (error) {
      fail(error);
    }
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
        expectedStaticAcks: new Set(),
        watchdog: null,
        context,
      };
      if (activeCount === 0) {
        finishIfComplete();
        return;
      }
      if (Number.isFinite(jobTimeoutMs) && jobTimeoutMs > 0) {
        const job = inFlight;
        job.watchdog = scheduleWatchdog(() => {
          if (inFlight === job) fail(new Error("Classic source Worker job timed out."));
        }, jobTimeoutMs);
      }
      for (let index = 0; index < activeCount; index += 1) {
        const worker = workers[index]!;
        if (installedFingerprints[index] !== context.fingerprint) {
          inFlight.expectedStaticAcks.add(index);
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
