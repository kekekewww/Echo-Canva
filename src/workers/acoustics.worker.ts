import { computeAcousticFrame, type AcousticFrame } from "@/acoustics/compute-frame";
import type { SceneSpec } from "@/domain/scene/types";

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

type WorkerScope = Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<AcousticWorkerRequest>) => void,
  ) => void;
  postMessage: (response: AcousticWorkerResponse) => void;
}>;

const scope = self as unknown as WorkerScope;
let pendingScene: SceneSpec | null = null;
let nextTimer: ReturnType<typeof setTimeout> | null = null;
let lastFrameAtMs = Number.NEGATIVE_INFINITY;

function updateIntervalMs(scene: SceneSpec): number {
  return 1000 / Math.max(1, scene.settings.acousticUpdateHz);
}

function scheduleFrame(): void {
  const scene = pendingScene;
  if (!scene || nextTimer !== null) return;

  const delayMs = Math.max(0, lastFrameAtMs + updateIntervalMs(scene) - Date.now());
  nextTimer = setTimeout(() => {
    nextTimer = null;
    computePendingFrame();
  }, delayMs);
}

function computePendingFrame(): void {
  const scene = pendingScene;
  pendingScene = null;
  if (!scene) return;

  const startedAtMs = Date.now();
  try {
    const frame = computeAcousticFrame(scene, startedAtMs);
    const completedAtMs = Date.now();
    lastFrameAtMs = completedAtMs;
    scope.postMessage({
      type: "FRAME",
      revision: scene.revision,
      frame,
      metrics: { computeMs: completedAtMs - startedAtMs, completedAtMs },
    });
  } catch (error) {
    lastFrameAtMs = Date.now();
    scope.postMessage({
      type: "ERROR",
      revision: scene.revision,
      code: "FRAME_COMPUTE_FAILED",
      message: error instanceof Error ? error.message : "Unable to compute acoustic frame.",
    });
  }

  scheduleFrame();
}

scope.addEventListener("message", (event) => {
  if (event.data.type === "DISPOSE") {
    pendingScene = null;
    if (nextTimer !== null) clearTimeout(nextTimer);
    nextTimer = null;
    return;
  }

  pendingScene = event.data.scene;
  scheduleFrame();
});
