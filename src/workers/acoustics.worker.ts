import { computeAcousticFrame, type AcousticFrame } from "@/acoustics/compute-frame";
import { acousticUpdateIntervalMs } from "@/acoustics/update-rate";
import type { SceneSpec } from "@/domain/scene/types";

export { acousticUpdateIntervalMs } from "@/acoustics/update-rate";

export type AcousticWorkerRequest =
  | { type: "UPDATE_SCENE"; scene: SceneSpec }
  | { type: "DISPOSE" };

export type WorkerMetrics = Readonly<{
  computeMs: number;
  completedAtMs: number;
}>;

export type AcousticWorkerResponse =
  | { type: "FRAME"; revision: number; frame: AcousticFrame; metrics: WorkerMetrics }
  | { type: "ERROR"; revision: number; code: string; message: string };

type WorkerResponseSink = Readonly<{
  postMessage: (response: AcousticWorkerResponse) => void;
}>;

type WorkerControllerOptions = Readonly<{
  cancel?: (timer: unknown) => void;
  computeFrame?: (scene: SceneSpec, generatedAtMs: number) => AcousticFrame;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
}>;

export type AcousticWorkerController = Readonly<{
  handle: (request: AcousticWorkerRequest) => void;
}>;

export function createAcousticWorkerController(
  sink: WorkerResponseSink,
  options: WorkerControllerOptions = {},
): AcousticWorkerController {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const computeFrame = options.computeFrame ?? computeAcousticFrame;
  let disposed = false;
  let pendingScene: SceneSpec | null = null;
  let timer: unknown | null = null;
  let lastFrameAtMs = Number.NEGATIVE_INFINITY;

  const schedulePendingFrame = (): void => {
    const scene = pendingScene;
    if (!scene || disposed) return;
    if (timer !== null) cancel(timer);

    const delayMs = Math.max(
      0,
      lastFrameAtMs + acousticUpdateIntervalMs(scene.settings.acousticUpdateHz) - now(),
    );
    timer = schedule(() => {
      timer = null;
      const queuedScene = pendingScene;
      pendingScene = null;
      if (!queuedScene || disposed) return;

      const startedAtMs = now();
      try {
        const frame = computeFrame(queuedScene, startedAtMs);
        const completedAtMs = now();
        lastFrameAtMs = completedAtMs;
        sink.postMessage({
          type: "FRAME",
          revision: queuedScene.revision,
          frame,
          metrics: { computeMs: completedAtMs - startedAtMs, completedAtMs },
        });
      } catch (error) {
        lastFrameAtMs = now();
        sink.postMessage({
          type: "ERROR",
          revision: queuedScene.revision,
          code: "FRAME_COMPUTE_FAILED",
          message: error instanceof Error ? error.message : "Unable to compute acoustic frame.",
        });
      }
    }, delayMs);
  };

  return {
    handle(request): void {
      if (disposed) return;
      if (request.type === "DISPOSE") {
        disposed = true;
        pendingScene = null;
        if (timer !== null) cancel(timer);
        timer = null;
        return;
      }

      pendingScene = request.scene;
      schedulePendingFrame();
    },
  };
}

type BrowserWorkerScope = WorkerResponseSink & Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<AcousticWorkerRequest>) => void,
  ) => void;
}>;

if (typeof self !== "undefined") {
  const scope = self as unknown as BrowserWorkerScope;
  const controller = createAcousticWorkerController(scope);
  scope.addEventListener("message", (event) => controller.handle(event.data));
}
