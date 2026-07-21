import type { PatchBvh } from "@/acoustics/hybrid3d/bvh";
import {
  type HybridStaticGeometry,
} from "@/acoustics/hybrid3d/compile";
import {
  computeHybridDirectSources,
  type HybridDirectPoseSnapshot,
  type HybridDirectSourceResult,
} from "@/acoustics/hybrid3d/direct";

export type HybridDirectWorkerRequest =
  | Readonly<{ type: "INSTALL_STATIC"; requestId: number; structure: HybridStaticGeometry }>
  | Readonly<{
    type: "COMPUTE_SHARD";
    requestId: number;
    staticFingerprint: string;
    snapshot: HybridDirectPoseSnapshot;
    sourceIds: readonly string[];
  }>
  | Readonly<{ type: "DISPOSE"; requestId?: number }>;

export type HybridDirectWorkerResponse =
  | Readonly<{
    type: "STATIC_INSTALLED";
    requestId: number;
    staticFingerprint: string;
  }>
  | Readonly<{
    type: "SHARD_RESULT";
    requestId: number;
    staticFingerprint: string;
    revision: number;
    sourceIds: readonly string[];
    results: readonly HybridDirectSourceResult[];
    computeMs: number;
    completedAtMs: number;
  }>
  | Readonly<{
    type: "ERROR";
    requestId: number;
    code:
      | "HYBRID_STATIC_NOT_INSTALLED"
      | "HYBRID_STATIC_FINGERPRINT_MISMATCH"
      | "HYBRID_SHARD_COMPUTE_FAILED"
      | "HYBRID_UNSUPPORTED_REQUEST";
    message: string;
  }>;

type WorkerSink = Readonly<{ postMessage: (response: HybridDirectWorkerResponse) => void }>;

type ComputeSources = (
  snapshot: HybridDirectPoseSnapshot,
  bvh: PatchBvh,
  sourceIds: readonly string[],
) => readonly HybridDirectSourceResult[];

type HybridDirectWorkerControllerOptions = Readonly<{
  computeSources?: ComputeSources;
  now?: () => number;
}>;

export function createHybridDirectWorkerController(
  sink: WorkerSink,
  options: HybridDirectWorkerControllerOptions = {},
): Readonly<{ handle: (request: unknown) => void }> {
  const now = options.now ?? Date.now;
  const computeSources = options.computeSources ?? computeHybridDirectSources;
  let disposed = false;
  let installed: HybridStaticGeometry | null = null;

  return {
    handle(request): void {
      if (disposed) return;
      if (typeof request !== "object" || request === null || !("type" in request)) {
        sink.postMessage({
          type: "ERROR",
          requestId: -1,
          code: "HYBRID_UNSUPPORTED_REQUEST",
          message: "Unsupported Hybrid source Worker request: unknown.",
        });
        return;
      }
      const runtimeRequest = request as Readonly<{ type: unknown; requestId?: unknown }>;
      if (
        runtimeRequest.type !== "DISPOSE"
        && runtimeRequest.type !== "INSTALL_STATIC"
        && runtimeRequest.type !== "COMPUTE_SHARD"
      ) {
        sink.postMessage({
          type: "ERROR",
          requestId: typeof runtimeRequest.requestId === "number" && Number.isFinite(runtimeRequest.requestId)
            ? runtimeRequest.requestId
            : -1,
          code: "HYBRID_UNSUPPORTED_REQUEST",
          message: `Unsupported Hybrid source Worker request: ${String(runtimeRequest.type)}.`,
        });
        return;
      }
      const typedRequest = request as HybridDirectWorkerRequest;
      if (typedRequest.type === "DISPOSE") {
        disposed = true;
        installed = null;
        return;
      }
      if (typedRequest.type === "INSTALL_STATIC") {
        installed = typedRequest.structure;
        sink.postMessage({
          type: "STATIC_INSTALLED",
          requestId: typedRequest.requestId,
          staticFingerprint: typedRequest.structure.staticGeometryHash,
        });
        return;
      }
      if (typedRequest.type !== "COMPUTE_SHARD") return;
      if (!installed) {
        sink.postMessage({
          type: "ERROR",
          requestId: typedRequest.requestId,
          code: "HYBRID_STATIC_NOT_INSTALLED",
          message: "Install Hybrid static geometry before computing a source shard.",
        });
        return;
      }
      if (
        typedRequest.staticFingerprint !== installed.staticGeometryHash
        || typedRequest.snapshot.staticFingerprint !== installed.staticGeometryHash
      ) {
        sink.postMessage({
          type: "ERROR",
          requestId: typedRequest.requestId,
          code: "HYBRID_STATIC_FINGERPRINT_MISMATCH",
          message: `Hybrid source shard requested ${typedRequest.staticFingerprint}, but ${installed.staticGeometryHash} is installed.`,
        });
        return;
      }
      const startedAtMs = now();
      try {
        const results = computeSources(typedRequest.snapshot, installed.bvh, typedRequest.sourceIds);
        const completedAtMs = now();
        sink.postMessage({
          type: "SHARD_RESULT",
          requestId: typedRequest.requestId,
          staticFingerprint: installed.staticGeometryHash,
          revision: typedRequest.snapshot.revision,
          sourceIds: typedRequest.sourceIds,
          results,
          computeMs: completedAtMs - startedAtMs,
          completedAtMs,
        });
      } catch (error) {
        sink.postMessage({
          type: "ERROR",
          requestId: typedRequest.requestId,
          code: "HYBRID_SHARD_COMPUTE_FAILED",
          message: error instanceof Error ? error.message : "Hybrid source shard computation failed.",
        });
      }
    },
  };
}

type BrowserWorkerScope = WorkerSink & Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<HybridDirectWorkerRequest>) => void,
  ) => void;
}>;

if (typeof self !== "undefined") {
  const scope = self as unknown as BrowserWorkerScope;
  const controller = createHybridDirectWorkerController(scope);
  scope.addEventListener("message", (event) => controller.handle(event.data));
}
