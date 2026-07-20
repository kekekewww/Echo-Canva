import type { HybridGeometry } from "@/acoustics/hybrid3d/compile";
import {
  assembleHybridDirectFrame,
  computeHybridDirectFrame,
  createHybridDirectPoseSnapshot,
  type DirectPath3D,
  type HybridDirectFrame,
  type HybridDirectPoseSnapshot,
  type HybridDirectSourceResult,
} from "@/acoustics/hybrid3d/direct";
import type { SegmentPatchHit, Vec3 } from "@/acoustics/hybrid3d/geometry";
import type { FirstOrderReflection3D } from "@/acoustics/hybrid3d/reflections";
import { acousticUpdateIntervalMs } from "@/acoustics/update-rate";
import type { SceneDocumentV2 } from "@/domain/scene-document/types";
import type {
  HybridDirectWorkerRequest,
  HybridDirectWorkerResponse,
} from "@/workers/hybrid-direct.worker";
import { classicSourcePoolCapacity } from "@/workers/worker-pool-policy";

export type HybridDirectPoolWorkerLike = {
  postMessage: (request: HybridDirectWorkerRequest) => void;
  terminate: () => void;
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessage: ((event: MessageEvent<HybridDirectWorkerResponse>) => unknown) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => unknown) | null;
};

export type HybridDirectPoolMetrics = Readonly<{
  computeMs: number;
  completedAtMs: number;
  requestSequence: number;
  workerCount: number;
  sourceComputeMsMax: number;
  sourceComputeMsTotal: number;
}>;

export type HybridDirectPoolResult = Readonly<{
  frame: HybridDirectFrame;
  source: "worker" | "fallback";
  metrics: HybridDirectPoolMetrics;
  notice: string | null;
}>;

export type HybridDirectPoolLike = {
  update: (document: SceneDocumentV2, geometry: HybridGeometry) => void;
  dispose: () => void;
  onresult: ((result: HybridDirectPoolResult) => unknown) | null;
};

type DocumentGeometryPair = Readonly<{
  document: SceneDocumentV2;
  geometry: HybridGeometry;
}>;

type InFlightJob = {
  requestId: number;
  startedAtMs: number;
  snapshot: HybridDirectPoseSnapshot;
  assignments: readonly (readonly string[])[];
  resultsByWorker: Map<number, readonly HybridDirectSourceResult[]>;
  computeMsByWorker: Map<number, number>;
  expectedStaticAcks: Set<number>;
  watchdog: unknown | null;
  geometry: HybridGeometry;
};

type HybridDirectPoolOptions = Readonly<{
  assembleFrame?: (
    snapshot: HybridDirectPoseSnapshot,
    results: readonly HybridDirectSourceResult[],
    computedAtMs: number,
  ) => HybridDirectFrame;
  cancel?: (timer: unknown) => void;
  cancelWatchdog?: (timer: unknown) => void;
  createWorker?: () => HybridDirectPoolWorkerLike;
  hardwareConcurrency?: number;
  jobTimeoutMs?: number;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  scheduleWatchdog?: (callback: () => void, delayMs: number) => unknown;
}>;

const FALLBACK_NOTICE = "Hybrid Worker pool unavailable; using deterministic serial fallback.";
const DEFAULT_JOB_TIMEOUT_MS = 2_000;
const MAX_ID_LENGTH = 128;
const MAX_COORDINATE_M = 100;
const MAX_DISTANCE_M = 250;
const MAX_DELAY_MS = 2_000;
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

function isUniqueKnownStringArray(
  value: unknown,
  maximumLength: number,
  knownIds: ReadonlySet<string>,
): value is string[] {
  return Array.isArray(value)
    && value.length <= maximumLength
    && value.every((entry) => isBoundedString(entry) && knownIds.has(entry))
    && new Set(value).size === value.length;
}

function isVec3(value: unknown): value is Vec3 {
  return isRecord(value)
    && isBoundedNumber(value.x, -MAX_COORDINATE_M, MAX_COORDINATE_M)
    && isBoundedNumber(value.y, -MAX_COORDINATE_M, MAX_COORDINATE_M)
    && isBoundedNumber(value.z, -MAX_COORDINATE_M, MAX_COORDINATE_M);
}

function isUnitVector(value: unknown): value is Vec3 {
  return isVec3(value) && Math.abs(Math.hypot(value.x, value.y, value.z) - 1) <= 1e-3;
}

function isSegmentPatchHit(
  value: unknown,
  geometry: HybridGeometry,
  pathDistanceM: number,
): value is SegmentPatchHit {
  if (!isRecord(value) || !isBoundedString(value.patchId)) return false;
  const patch = geometry.patches.find(({ id }) => id === value.patchId);
  return patch !== undefined
    && value.wallId === patch.wallId
    && value.surfaceId === patch.surfaceId
    && value.materialId === patch.materialId
    && isBoundedNumber(value.thicknessM, 0, 50)
    && isBoundedNumber(value.distanceM, 0, pathDistanceM)
    && isVec3(value.point);
}

function isDirectPath(value: unknown, sourceId: string, geometry: HybridGeometry): value is DirectPath3D {
  if (!isRecord(value) || !isBoundedNumber(value.distanceM, 0, MAX_DISTANCE_M)) return false;
  const distanceM = value.distanceM;
  const occluderIds = new Set(geometry.patches.map(({ wallId, surfaceId }) => wallId ?? surfaceId));
  if (!Array.isArray(value.hits) || value.hits.length > geometry.patches.length) return false;
  if (!value.hits.every((hit) => isSegmentPatchHit(hit, geometry, distanceM))) return false;
  const expectedOccluders = [...new Set((value.hits as SegmentPatchHit[]).map(({ wallId, surfaceId }) => wallId ?? surfaceId))];
  const routeConsistent = value.routeType === "direct"
    ? value.directVisible === true && value.hits.length === 0 && expectedOccluders.length === 0
    : value.routeType === "blocked"
      ? value.directVisible === false && value.hits.length > 0 && expectedOccluders.length > 0
      : false;
  return routeConsistent
    && value.sourceId === sourceId
    && isBoundedNumber(value.delayMs, 0, MAX_DELAY_MS)
    && isUnitVector(value.directionToSource)
    && isUnitVector(value.propagationDirection)
    && Math.abs(
      value.directionToSource.x * value.propagationDirection.x
      + value.directionToSource.y * value.propagationDirection.y
      + value.directionToSource.z * value.propagationDirection.z
      + 1
    ) <= 1e-3
    && isBoundedNumber(value.azimuthDeg, -180, 180)
    && isBoundedNumber(value.elevationDeg, -90, 90)
    && isUniqueKnownStringArray(value.occluderWallIds, geometry.patches.length, occluderIds)
    && value.occluderWallIds.length === expectedOccluders.length
    && value.occluderWallIds.every((id, index) => id === expectedOccluders[index]);
}

function isReflection(value: unknown, geometry: HybridGeometry): value is FirstOrderReflection3D {
  if (!isRecord(value) || !isBoundedString(value.patchId)) return false;
  const patch = geometry.patches.find(({ id }) => id === value.patchId);
  const expectedSurfaceId = patch?.wallId ?? patch?.id;
  return patch !== undefined
    && isBoundedString(value.id)
    && value.surfaceId === expectedSurfaceId
    && value.materialId === patch.materialId
    && isVec3(value.reflectionPoint)
    && isBoundedNumber(value.pathLengthM, 0, MAX_DISTANCE_M * 2)
    && isBoundedNumber(value.delayMs, 0, MAX_DELAY_MS)
    && isBoundedNumber(value.excessDelayMs, 0, MAX_DELAY_MS)
    && isUnitVector(value.arrivalDirection);
}

function isSourceResult(
  value: unknown,
  sourceId: string,
  snapshot: HybridDirectPoseSnapshot,
  geometry: HybridGeometry,
): value is HybridDirectSourceResult {
  return isRecord(value)
    && value.sourceId === sourceId
    && value.revision === snapshot.revision
    && value.staticFingerprint === snapshot.staticFingerprint
    && value.classicProjectionHash === snapshot.classicProjectionHash
    && isDirectPath(value.path, sourceId, geometry)
    && Array.isArray(value.firstOrderReflections)
    && value.firstOrderReflections.length <= geometry.patches.length
    && value.firstOrderReflections.every((reflection) => isReflection(reflection, geometry));
}

function sameSourceIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((sourceId, index) => sourceId === right[index]);
}

function pairMatches(document: SceneDocumentV2, geometry: HybridGeometry): boolean {
  return geometry.document === document
    && geometry.document.baseScene.revision === document.baseScene.revision
    && geometry.document.compatibility.classicProjectionHash === document.compatibility.classicProjectionHash;
}

export function createHybridDirectPool(
  options: HybridDirectPoolOptions = {},
): HybridDirectPoolLike {
  const capacity = classicSourcePoolCapacity(options.hardwareConcurrency);
  const assembleFrame = options.assembleFrame ?? assembleHybridDirectFrame;
  const cancel = options.cancel ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const scheduleWatchdog = options.scheduleWatchdog ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelWatchdog = options.cancelWatchdog ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const jobTimeoutMs = options.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
  const createWorker = options.createWorker ?? (() => new Worker(
    new URL("./hybrid-direct.worker.ts", import.meta.url),
  ) as HybridDirectPoolWorkerLike);
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const workers: HybridDirectPoolWorkerLike[] = [];
  const installedFingerprints: (string | null)[] = [];
  let disposed = false;
  let workersTerminated = false;
  let usingFallback = false;
  let latestPair: DocumentGeometryPair | null = null;
  let pendingPair: DocumentGeometryPair | null = null;
  let inFlight: InFlightJob | null = null;
  let timer: unknown | null = null;
  let requestId = 0;
  let lastFrameAtMs = Number.NEGATIVE_INFINITY;

  function cancelJobWatchdog(job: InFlightJob | null): void {
    if (job?.watchdog !== null && job?.watchdog !== undefined) {
      cancelWatchdog(job.watchdog);
      job.watchdog = null;
    }
  }

  const pool: HybridDirectPoolLike = {
    onresult: null,
    update(document, geometry): void {
      if (disposed) return;
      if (!pairMatches(document, geometry)) {
        latestPair = { document, geometry };
        activateFallback();
        return;
      }
      latestPair = { document, geometry };
      pendingPair = latestPair;
      if (!inFlight && timer !== null) {
        cancel(timer);
        timer = null;
      }
      schedulePending();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (timer !== null) cancel(timer);
      timer = null;
      pendingPair = null;
      cancelJobWatchdog(inFlight);
      inFlight = null;
      terminateWorkers(true);
    },
  };

  function terminateWorkers(postDispose: boolean): void {
    if (workersTerminated) return;
    workersTerminated = true;
    for (const worker of workers) {
      if (postDispose) {
        try {
          worker.postMessage({ type: "DISPOSE", requestId: ++requestId });
        } catch {
          // terminate() remains the authoritative release operation.
        }
      }
      worker.terminate();
    }
  }

  function fallbackResult(pair: DocumentGeometryPair): HybridDirectPoolResult {
    const startedAtMs = now();
    const computedFrame = computeHybridDirectFrame(pair.geometry);
    const completedAtMs = now();
    const frame = { ...computedFrame, computedAtMs: completedAtMs };
    return {
      frame,
      source: "fallback",
      notice: FALLBACK_NOTICE,
      metrics: {
        computeMs: completedAtMs - startedAtMs,
        completedAtMs,
        workerCount: 0,
        sourceComputeMsMax: 0,
        sourceComputeMsTotal: 0,
        requestSequence: ++requestId,
      },
    };
  }

  function activateFallback(): void {
    if (disposed || usingFallback) return;
    usingFallback = true;
    if (timer !== null) cancel(timer);
    timer = null;
    pendingPair = null;
    cancelJobWatchdog(inFlight);
    inFlight = null;
    terminateWorkers(false);
    const pair = latestPair;
    if (!pair) return;
    const result = fallbackResult(pair);
    lastFrameAtMs = result.metrics.completedAtMs;
    pool.onresult?.(result);
  }

  function schedulePending(): void {
    if (disposed || !pendingPair || inFlight || timer !== null) return;
    const delayMs = Math.max(
      0,
      lastFrameAtMs
        + acousticUpdateIntervalMs(pendingPair.document.baseScene.settings.acousticUpdateHz)
        - now(),
    );
    timer = schedule(() => {
      timer = null;
      const pair = pendingPair;
      pendingPair = null;
      if (disposed || !pair) return;
      if (usingFallback) {
        const result = fallbackResult(pair);
        lastFrameAtMs = result.metrics.completedAtMs;
        pool.onresult?.(result);
      } else {
        dispatch(pair);
      }
      schedulePending();
    }, delayMs);
  }

  function fail(): void {
    activateFallback();
  }

  function finishIfComplete(): void {
    const job = inFlight;
    if (!job || job.resultsByWorker.size !== job.assignments.length) return;
    try {
      const completedAtMs = now();
      const frame = assembleFrame(
        job.snapshot,
        job.assignments.flatMap((_, index) => job.resultsByWorker.get(index) ?? []),
        completedAtMs,
      );
      const shardTimes = [...job.computeMsByWorker.values()];
      const result: HybridDirectPoolResult = {
        frame,
        source: "worker",
        notice: null,
        metrics: {
          computeMs: completedAtMs - job.startedAtMs,
          completedAtMs,
          workerCount: job.assignments.length,
          sourceComputeMsMax: Math.max(0, ...shardTimes),
          sourceComputeMsTotal: shardTimes.reduce((total, value) => total + value, 0),
          requestSequence: job.requestId,
        },
      };
      const obsolete = pendingPair !== null;
      lastFrameAtMs = completedAtMs;
      cancelJobWatchdog(job);
      inFlight = null;
      if (!obsolete) pool.onresult?.(result);
      schedulePending();
    } catch {
      fail();
    }
  }

  function handleWorkerResponse(workerIndex: number, payload: unknown): void {
    if (disposed || usingFallback) return;
    try {
      if (!isRecord(payload) || typeof payload.type !== "string") {
        throw new Error("Hybrid source Worker returned a malformed response.");
      }
      if (payload.type === "ERROR") throw new Error("Hybrid source Worker reported an error.");
      const job = inFlight;
      if (!job) throw new Error("Hybrid source Worker responded without an in-flight job.");
      if (
        (payload.type !== "STATIC_INSTALLED" && payload.type !== "SHARD_RESULT")
        || payload.requestId !== job.requestId
        || payload.staticFingerprint !== job.snapshot.staticFingerprint
        || workerIndex >= job.assignments.length
      ) {
        throw new Error("Hybrid source Worker response identity mismatch.");
      }
      if (payload.type === "STATIC_INSTALLED") {
        if (!job.expectedStaticAcks.delete(workerIndex)) {
          throw new Error("Hybrid source Worker returned an unexpected static acknowledgement.");
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
        || !isBoundedNumber(payload.computeMs, 0, MAX_TIMING_MS)
        || !isBoundedNumber(payload.completedAtMs, 0, Number.MAX_SAFE_INTEGER)
        || !Array.isArray(payload.results)
        || payload.results.length !== assignment.length
        || !payload.results.every((result, index) => isSourceResult(
          result,
          assignment[index]!,
          job.snapshot,
          job.geometry,
        ))
      ) {
        throw new Error("Hybrid source Worker returned a malformed shard.");
      }
      job.resultsByWorker.set(workerIndex, payload.results);
      job.computeMsByWorker.set(workerIndex, payload.computeMs);
      finishIfComplete();
    } catch {
      fail();
    }
  }

  function dispatch(pair: DocumentGeometryPair): void {
    const startedAtMs = now();
    try {
      const sourceIds = pair.document.baseScene.sources.map(({ id }) => id);
      const activeCount = Math.min(sourceIds.length, capacity);
      while (workers.length < activeCount) {
        const worker = createWorker();
        const workerIndex = workers.length;
        worker.onmessage = (event) => handleWorkerResponse(workerIndex, event.data);
        worker.onerror = () => fail();
        worker.onmessageerror = () => fail();
        workers.push(worker);
        installedFingerprints.push(null);
      }
      const snapshot = createHybridDirectPoseSnapshot(pair.geometry);
      const nextRequestId = ++requestId;
      const assignments = Array.from({ length: activeCount }, (_, workerIndex) =>
        sourceIds.filter((_, sourceIndex) => sourceIndex % activeCount === workerIndex));
      inFlight = {
        requestId: nextRequestId,
        startedAtMs,
        snapshot,
        assignments,
        resultsByWorker: new Map(),
        computeMsByWorker: new Map(),
        expectedStaticAcks: new Set(),
        watchdog: null,
        geometry: pair.geometry,
      };
      if (activeCount === 0) {
        finishIfComplete();
        return;
      }
      if (Number.isFinite(jobTimeoutMs) && jobTimeoutMs > 0) {
        const job = inFlight;
        job.watchdog = scheduleWatchdog(() => {
          if (inFlight === job) fail();
        }, jobTimeoutMs);
      }
      const structure = {
        staticGeometryHash: pair.geometry.staticGeometryHash,
        patches: pair.geometry.patches,
        bvh: pair.geometry.bvh,
      };
      for (let workerIndex = 0; workerIndex < activeCount; workerIndex += 1) {
        const worker = workers[workerIndex]!;
        if (installedFingerprints[workerIndex] !== pair.geometry.staticGeometryHash) {
          inFlight.expectedStaticAcks.add(workerIndex);
          worker.postMessage({ type: "INSTALL_STATIC", requestId: nextRequestId, structure });
          installedFingerprints[workerIndex] = pair.geometry.staticGeometryHash;
        }
        worker.postMessage({
          type: "COMPUTE_SHARD",
          requestId: nextRequestId,
          staticFingerprint: pair.geometry.staticGeometryHash,
          snapshot,
          sourceIds: assignments[workerIndex]!,
        });
      }
    } catch {
      fail();
    }
  }

  return pool;
}
