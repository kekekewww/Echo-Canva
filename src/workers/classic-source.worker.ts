import {
  computeClassicSourceResults,
  type ClassicPoseSnapshot,
  type ClassicSourceResult,
  type ClassicStaticContext,
} from "@/acoustics/compute-frame";

export type ClassicSourceWorkerRequest =
  | Readonly<{ type: "INSTALL_STATIC"; requestId: number; context: ClassicStaticContext }>
  | Readonly<{
    type: "COMPUTE_SHARD";
    requestId: number;
    staticFingerprint: string;
    snapshot: ClassicPoseSnapshot;
    sourceIds: readonly string[];
  }>
  | Readonly<{ type: "DISPOSE"; requestId: number }>;

export type ClassicSourceWorkerResponse =
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
    results: readonly ClassicSourceResult[];
    computeMs: number;
    completedAtMs: number;
  }>
  | Readonly<{
    type: "ERROR";
    requestId: number;
    code:
      | "CLASSIC_STATIC_NOT_INSTALLED"
      | "CLASSIC_STATIC_FINGERPRINT_MISMATCH"
      | "CLASSIC_SHARD_COMPUTE_FAILED";
    message: string;
  }>;

type WorkerSink = Readonly<{ postMessage: (response: ClassicSourceWorkerResponse) => void }>;

type ClassicSourceWorkerControllerOptions = Readonly<{ now?: () => number }>;

export function createClassicSourceWorkerController(
  sink: WorkerSink,
  options: ClassicSourceWorkerControllerOptions = {},
): Readonly<{ handle: (request: ClassicSourceWorkerRequest) => void }> {
  const now = options.now ?? Date.now;
  let disposed = false;
  let installed: ClassicStaticContext | null = null;

  return {
    handle(request): void {
      if (disposed) return;
      if (request.type === "DISPOSE") {
        disposed = true;
        installed = null;
        return;
      }
      if (request.type === "INSTALL_STATIC") {
        installed = request.context;
        sink.postMessage({
          type: "STATIC_INSTALLED",
          requestId: request.requestId,
          staticFingerprint: request.context.fingerprint,
        });
        return;
      }
      if (!installed) {
        sink.postMessage({
          type: "ERROR",
          requestId: request.requestId,
          code: "CLASSIC_STATIC_NOT_INSTALLED",
          message: "Install Classic static context before computing a source shard.",
        });
        return;
      }
      if (
        request.staticFingerprint !== installed.fingerprint
        || request.snapshot.staticFingerprint !== installed.fingerprint
      ) {
        sink.postMessage({
          type: "ERROR",
          requestId: request.requestId,
          code: "CLASSIC_STATIC_FINGERPRINT_MISMATCH",
          message: `Classic source shard requested ${request.staticFingerprint}, but ${installed.fingerprint} is installed.`,
        });
        return;
      }
      const startedAtMs = now();
      try {
        const results = computeClassicSourceResults(
          installed,
          request.snapshot,
          request.sourceIds,
        );
        const completedAtMs = now();
        sink.postMessage({
          type: "SHARD_RESULT",
          requestId: request.requestId,
          staticFingerprint: installed.fingerprint,
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
          code: "CLASSIC_SHARD_COMPUTE_FAILED",
          message: error instanceof Error ? error.message : "Classic source shard computation failed.",
        });
      }
    },
  };
}

type BrowserWorkerScope = WorkerSink & Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<ClassicSourceWorkerRequest>) => void,
  ) => void;
}>;

if (typeof self !== "undefined") {
  const scope = self as unknown as BrowserWorkerScope;
  const controller = createClassicSourceWorkerController(scope);
  scope.addEventListener("message", (event) => controller.handle(event.data));
}
