import type { PatchBvh } from "@/acoustics/hybrid3d/bvh";
import type { HybridStaticGeometry } from "@/acoustics/hybrid3d/compile";
import {
  computeHybridDirectSources,
  type HybridDirectFrame,
  type HybridDirectPoseSnapshot,
  type HybridDirectSourceResult,
} from "@/acoustics/hybrid3d/direct";
import type { SceneDocumentV2 } from "@/domain/scene-document/types";

export type HybridDirectWorkerRequest =
  | Readonly<{ type: "INSTALL_STATIC"; requestId: number; structure: HybridStaticGeometry }>
  | Readonly<{
    type: "COMPUTE_SHARD";
    requestId: number;
    staticFingerprint: string;
    snapshot: HybridDirectPoseSnapshot;
    sourceIds: readonly string[];
  }>
  | Readonly<{ type: "DISPOSE"; requestId?: number }>
  /** Type-only compatibility until the pool coordinator replaces the existing hook. */
  | Readonly<{ type: "COMPUTE"; requestId: number; document: SceneDocumentV2 }>;

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
      | "HYBRID_DIRECT_PROTOCOL_UNSUPPORTED";
    message: string;
  }>
  /** Type-only compatibility; this shard Worker never emits a full frame. */
  | Readonly<{ type: "FRAME"; requestId: number; frame: HybridDirectFrame; computeMs: number }>;

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
): Readonly<{ handle: (request: HybridDirectWorkerRequest) => void }> {
  const now = options.now ?? Date.now;
  const computeSources = options.computeSources ?? computeHybridDirectSources;
  let disposed = false;
  let installed: HybridStaticGeometry | null = null;

  return {
    handle(request): void {
      if (disposed) return;
      if (request.type === "DISPOSE") {
        disposed = true;
        installed = null;
        return;
      }
      if (request.type === "INSTALL_STATIC") {
        installed = request.structure;
        sink.postMessage({
          type: "STATIC_INSTALLED",
          requestId: request.requestId,
          staticFingerprint: request.structure.staticGeometryHash,
        });
        return;
      }
      if (request.type === "COMPUTE") {
        sink.postMessage({
          type: "ERROR",
          requestId: request.requestId,
          code: "HYBRID_DIRECT_PROTOCOL_UNSUPPORTED",
          message: "Install static Hybrid geometry and send a pose-only COMPUTE_SHARD request.",
        });
        return;
      }
      if (!installed) {
        sink.postMessage({
          type: "ERROR",
          requestId: request.requestId,
          code: "HYBRID_STATIC_NOT_INSTALLED",
          message: "Install Hybrid static geometry before computing a source shard.",
        });
        return;
      }
      if (
        request.staticFingerprint !== installed.staticGeometryHash
        || request.snapshot.staticFingerprint !== installed.staticGeometryHash
      ) {
        sink.postMessage({
          type: "ERROR",
          requestId: request.requestId,
          code: "HYBRID_STATIC_FINGERPRINT_MISMATCH",
          message: `Hybrid source shard requested ${request.staticFingerprint}, but ${installed.staticGeometryHash} is installed.`,
        });
        return;
      }
      const startedAtMs = now();
      try {
        const results = computeSources(request.snapshot, installed.bvh, request.sourceIds);
        const completedAtMs = now();
        sink.postMessage({
          type: "SHARD_RESULT",
          requestId: request.requestId,
          staticFingerprint: installed.staticGeometryHash,
          revision: request.snapshot.revision,
          sourceIds: request.sourceIds,
          results,
          computeMs: completedAtMs - startedAtMs,
          completedAtMs,
        });
      } catch (error) {
        sink.postMessage({
          type: "ERROR",
          requestId: request.requestId,
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
