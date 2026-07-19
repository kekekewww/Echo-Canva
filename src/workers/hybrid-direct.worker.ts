import {
  bindHybridPoses,
  compileHybridStaticGeometry,
  hybridStaticGeometryHash,
  type HybridStaticGeometry,
} from "@/acoustics/hybrid3d/compile";
import { computeHybridDirectFrame, type HybridDirectFrame } from "@/acoustics/hybrid3d/direct";
import type { SceneDocumentV2 } from "@/domain/scene-document/types";

export type HybridDirectWorkerRequest = Readonly<{
  type: "COMPUTE";
  requestId: number;
  document: SceneDocumentV2;
}> | Readonly<{ type: "DISPOSE" }>;

export type HybridDirectWorkerResponse =
  | Readonly<{ type: "FRAME"; requestId: number; frame: HybridDirectFrame; computeMs: number }>
  | Readonly<{ type: "ERROR"; requestId: number; code: string; message: string }>;

type WorkerSink = Readonly<{ postMessage: (response: HybridDirectWorkerResponse) => void }>;

type HybridDirectWorkerControllerOptions = Readonly<{
  compileStatic?: (document: SceneDocumentV2) => HybridStaticGeometry;
  now?: () => number;
}>;

export function createHybridDirectWorkerController(
  sink: WorkerSink,
  options: HybridDirectWorkerControllerOptions = {},
): Readonly<{ handle: (request: HybridDirectWorkerRequest) => void }> {
  const now = options.now ?? Date.now;
  const compileStatic = options.compileStatic ?? compileHybridStaticGeometry;
  let disposed = false;
  let cached: Readonly<{ hash: string; structure: HybridStaticGeometry }> | null = null;

  return {
    handle(request): void {
      if (disposed) return;
      if (request.type === "DISPOSE") {
        disposed = true;
        cached = null;
        return;
      }
      const startedAtMs = now();
      try {
        const hash = hybridStaticGeometryHash(request.document);
        if (!cached || cached.hash !== hash) {
          cached = { hash, structure: compileStatic(request.document) };
        }
        const geometry = bindHybridPoses(cached.structure, request.document);
        const completedAtMs = now();
        sink.postMessage({
          type: "FRAME",
          requestId: request.requestId,
          frame: computeHybridDirectFrame(geometry, completedAtMs),
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
