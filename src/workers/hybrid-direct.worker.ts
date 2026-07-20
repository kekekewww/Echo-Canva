import type { PatchBvh } from "@/acoustics/hybrid3d/bvh";
import {
  bindHybridPoses,
  compileHybridStaticGeometry,
  hybridStaticGeometryHash,
  type HybridGeometry,
  type HybridStaticGeometry,
} from "@/acoustics/hybrid3d/compile";
import {
  computeHybridDirectFrame,
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
  /** Temporary runtime compatibility until the pool coordinator replaces the existing hook. */
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
      | "HYBRID_DIRECT_COMPUTE_FAILED";
    message: string;
  }>
  /** Temporary legacy response; COMPUTE_SHARD only emits source results. */
  | Readonly<{ type: "FRAME"; requestId: number; frame: HybridDirectFrame; computeMs: number }>;

type WorkerSink = Readonly<{ postMessage: (response: HybridDirectWorkerResponse) => void }>;

type ComputeSources = (
  snapshot: HybridDirectPoseSnapshot,
  bvh: PatchBvh,
  sourceIds: readonly string[],
) => readonly HybridDirectSourceResult[];

type HybridDirectWorkerControllerOptions = Readonly<{
  compileStatic?: (document: SceneDocumentV2) => HybridStaticGeometry;
  computeFrame?: (geometry: HybridGeometry, computedAtMs?: number) => HybridDirectFrame;
  computeSources?: ComputeSources;
  now?: () => number;
}>;

export function createHybridDirectWorkerController(
  sink: WorkerSink,
  options: HybridDirectWorkerControllerOptions = {},
): Readonly<{ handle: (request: HybridDirectWorkerRequest) => void }> {
  const now = options.now ?? Date.now;
  const compileStatic = options.compileStatic ?? compileHybridStaticGeometry;
  const computeFrame = options.computeFrame ?? computeHybridDirectFrame;
  const computeSources = options.computeSources ?? computeHybridDirectSources;
  let disposed = false;
  let installed: HybridStaticGeometry | null = null;
  let legacyCached: HybridStaticGeometry | null = null;

  return {
    handle(request): void {
      if (disposed) return;
      if (request.type === "DISPOSE") {
        disposed = true;
        installed = null;
        legacyCached = null;
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
        const startedAtMs = now();
        try {
          const staticFingerprint = hybridStaticGeometryHash(request.document);
          if (!legacyCached || legacyCached.staticGeometryHash !== staticFingerprint) {
            legacyCached = compileStatic(request.document);
          }
          const geometry = bindHybridPoses(legacyCached, request.document);
          const computedFrame = computeFrame(geometry, 0);
          const completedAtMs = now();
          sink.postMessage({
            type: "FRAME",
            requestId: request.requestId,
            frame: { ...computedFrame, computedAtMs: completedAtMs },
            computeMs: completedAtMs - startedAtMs,
          });
        } catch (error) {
          sink.postMessage({
            type: "ERROR",
            requestId: request.requestId,
            code: "HYBRID_DIRECT_COMPUTE_FAILED",
            message: error instanceof Error ? error.message : "Hybrid direct computation failed.",
          });
        }
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
