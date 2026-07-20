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
import type { SceneSpec, Vec2 } from "@/domain/scene/types";
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
const SOUND_SPEED_MPS = 343;
const ABSOLUTE_TOLERANCE = 1e-5;
const RELATIVE_TOLERANCE = 1e-6;

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

function isVec2(value: unknown): value is Vec2 {
  return isRecord(value)
    && isBoundedNumber(value.x, -MAX_COORDINATE_M, MAX_COORDINATE_M)
    && isBoundedNumber(value.y, -MAX_COORDINATE_M, MAX_COORDINATE_M);
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(
    ABSOLUTE_TOLERANCE,
    RELATIVE_TOLERANCE * Math.max(Math.abs(left), Math.abs(right)),
  );
}

function distance2(left: Vec2, right: Vec2): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function samePoint2(left: Vec2, right: Vec2): boolean {
  return nearlyEqual(left.x, right.x) && nearlyEqual(left.y, right.y);
}

function pointOnWallSegment(point: Vec2, wall: SceneSpec["walls"][number]): boolean {
  const delta = { x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y };
  const lengthSquared = delta.x * delta.x + delta.y * delta.y;
  if (lengthSquared <= ABSOLUTE_TOLERANCE * ABSOLUTE_TOLERANCE) return false;
  const offset = { x: point.x - wall.a.x, y: point.y - wall.a.y };
  const perpendicularDistance = Math.abs(offset.x * delta.y - offset.y * delta.x)
    / Math.sqrt(lengthSquared);
  const projection = (offset.x * delta.x + offset.y * delta.y) / lengthSquared;
  return perpendicularDistance <= ABSOLUTE_TOLERANCE
    && projection >= -ABSOLUTE_TOLERANCE
    && projection <= 1 + ABSOLUTE_TOLERANCE;
}

function expectedReflectionPoint2(
  source: Vec2,
  listener: Vec2,
  wall: SceneSpec["walls"][number],
): Vec2 | null {
  const wallDirection = { x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y };
  const wallLengthSquared = wallDirection.x ** 2 + wallDirection.y ** 2;
  if (wallLengthSquared <= ABSOLUTE_TOLERANCE * ABSOLUTE_TOLERANCE) return null;
  const sourceOffset = { x: source.x - wall.a.x, y: source.y - wall.a.y };
  const projection = (sourceOffset.x * wallDirection.x + sourceOffset.y * wallDirection.y)
    / wallLengthSquared;
  const projectedSource = {
    x: wall.a.x + wallDirection.x * projection,
    y: wall.a.y + wallDirection.y * projection,
  };
  const imageSource = {
    x: 2 * projectedSource.x - source.x,
    y: 2 * projectedSource.y - source.y,
  };
  const imageRay = { x: listener.x - imageSource.x, y: listener.y - imageSource.y };
  const denominator = imageRay.x * wallDirection.y - imageRay.y * wallDirection.x;
  if (Math.abs(denominator) <= ABSOLUTE_TOLERANCE) return null;
  const wallOffset = { x: wall.a.x - imageSource.x, y: wall.a.y - imageSource.y };
  const time = (wallOffset.x * wallDirection.y - wallOffset.y * wallDirection.x) / denominator;
  if (time < -ABSOLUTE_TOLERANCE || time > 1 + ABSOLUTE_TOLERANCE) return null;
  const point = {
    x: imageSource.x + imageRay.x * time,
    y: imageSource.y + imageRay.y * time,
  };
  return pointOnWallSegment(point, wall) ? point : null;
}

function isEarlyReflection(
  value: unknown,
  sourcePosition: Vec2,
  listenerPosition: Vec2,
  effectiveDistanceM: number,
  wallsById: ReadonlyMap<string, SceneSpec["walls"][number]>,
): boolean {
  if (
    !isRecord(value)
    || !isBoundedString(value.wallId)
    || !isBoundedNumber(value.pathLengthM, 0, MAX_EFFECTIVE_DISTANCE_M)
    || !isBoundedNumber(value.delayMs, 0, MAX_EARLY_DELAY_MS)
    || !isBoundedNumber(value.gainDb, -120, 0)
    || !isBoundedNumber(value.lowpassHz, 20, 20_000)
    || !isVec2(value.reflectionPoint)
  ) return false;
  const wall = wallsById.get(value.wallId);
  if (!wall || !pointOnWallSegment(value.reflectionPoint, wall)) return false;
  const expectedReflectionPoint = expectedReflectionPoint2(sourcePosition, listenerPosition, wall);
  if (!expectedReflectionPoint || !samePoint2(value.reflectionPoint, expectedReflectionPoint)) return false;
  const expectedPathLengthM = distance2(sourcePosition, value.reflectionPoint)
    + distance2(value.reflectionPoint, listenerPosition);
  const expectedDelayMs = Math.max(
    0,
    ((expectedPathLengthM - effectiveDistanceM) / SOUND_SPEED_MPS) * 1_000,
  );
  return nearlyEqual(value.pathLengthM, expectedPathLengthM)
    && nearlyEqual(value.delayMs, expectedDelayMs);
}

function isAcousticFrameSource(
  value: unknown,
  sourceId: string,
  context: ClassicStaticContext,
  snapshot: ClassicPoseSnapshot,
): boolean {
  if (!isRecord(value)) return false;
  const source = snapshot.sources.find(({ id }) => id === sourceId);
  if (!source) return false;
  const wallsById = new Map(context.scene.walls.map((wall) => [wall.id, wall]));
  const wallIds = new Set(wallsById.keys());
  const portalIds = new Set(context.scene.portals.map(({ id }) => id));
  const routeType = value.routeType;
  const directVisible = value.directVisible;
  if (!isBoundedKnownStringArray(value.occluderWallIds, 100, wallIds)) return false;
  if (!isBoundedKnownStringArray(value.portalIds, 8, portalIds)) return false;
  const matchedPortalIds = value.portalIds;
  const routeConsistent = routeType === "direct"
    ? directVisible === true && value.occluderWallIds.length === 0 && value.portalIds.length === 0
    : routeType === "portal"
      ? directVisible === false && value.portalIds.length > 0
      : routeType === "blocked"
        ? directVisible === false && value.portalIds.length === 0
        : false;
  if (!isBoundedNumber(value.physicalDistanceM, 0, MAX_PHYSICAL_DISTANCE_M)) return false;
  const physicalDistanceM = value.physicalDistanceM;
  const expectedPhysicalDistanceM = distance2(source.position, snapshot.listener.position);
  if (!nearlyEqual(physicalDistanceM, expectedPhysicalDistanceM)) return false;
  if (!isBoundedNumber(value.effectiveDistanceM, physicalDistanceM, MAX_EFFECTIVE_DISTANCE_M)) return false;
  const effectiveDistanceM = value.effectiveDistanceM;
  if (!Array.isArray(value.routePolyline)
    || value.routePolyline.length < 2
    || value.routePolyline.length > MAX_CLASSIC_ROUTE_POINTS
    || !value.routePolyline.every(isVec2)) return false;
  const routePolyline = value.routePolyline;
  const routeLengthM = routePolyline.slice(1).reduce(
    (total, point, index) => total + distance2(routePolyline[index]!, point),
    0,
  );
  if (!samePoint2(routePolyline[0]!, source.position)
    || !samePoint2(routePolyline.at(-1)!, snapshot.listener.position)
    || !nearlyEqual(routeLengthM, effectiveDistanceM)) return false;
  if (routeType === "portal") {
    if (routePolyline.length !== matchedPortalIds.length + 2) return false;
    for (let index = 0; index < matchedPortalIds.length; index += 1) {
      const portal = context.scene.portals.find(({ id }) => id === matchedPortalIds[index]);
      if (!portal || !samePoint2(routePolyline[index + 1]!, portal.center)) return false;
    }
  } else if (routePolyline.length !== 2) {
    return false;
  }
  return routeConsistent
    && value.sourceId === sourceId
    && (routeType === "portal" || nearlyEqual(effectiveDistanceM, physicalDistanceM))
    && isBoundedNumber(value.dryGainDb, -192, 0)
    && isBoundedNumber(value.lowpassHz, 20, 20_000)
    && isBoundedNumber(value.reverbSendDb, -120, 12)
    && isVec2(value.virtualPosition)
    && Array.isArray(value.earlyReflections)
    && value.earlyReflections.length <= MAX_CLASSIC_REFLECTIONS
    && value.earlyReflections.every((reflection) => isEarlyReflection(
      reflection,
      source.position,
      snapshot.listener.position,
      effectiveDistanceM,
      wallsById,
    ));
}

function isClassicSourceResult(
  value: unknown,
  sourceId: string,
  revision: number,
  staticFingerprint: string,
  context: ClassicStaticContext,
  snapshot: ClassicPoseSnapshot,
): value is ClassicSourceResult {
  return isRecord(value)
    && value.sourceId === sourceId
    && value.revision === revision
    && value.staticFingerprint === staticFingerprint
    && isAcousticFrameSource(value.frame, sourceId, context, snapshot);
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
          job.snapshot,
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
