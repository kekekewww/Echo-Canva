"use client";

import { useEffect, useRef, useState } from "react";

import { computeAcousticFrame, type AcousticFrame } from "@/acoustics/compute-frame";
import type { SceneSpec } from "@/domain/scene/types";
import type {
  AcousticWorkerRequest,
  AcousticWorkerResponse,
} from "@/workers/acoustics.worker";

const FALLBACK_NOTICE = "Worker unavailable; using deterministic main-thread acoustic updates.";

type FrameState = Readonly<{
  revision: number;
  current: AcousticFrame | null;
  fallbackNotice: string | null;
}>;

export type AcousticFrameResult = Readonly<{
  frame: AcousticFrame | null;
  fallbackNotice: string | null;
}>;

type AcousticWorkerLike = {
  postMessage: (request: AcousticWorkerRequest) => void;
  terminate: () => void;
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessage: ((event: MessageEvent<AcousticWorkerResponse>) => unknown) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => unknown) | null;
};

type AcousticFrameClientOptions = Readonly<{
  cancel: (timer: unknown) => void;
  cancelFrame: (frame: unknown) => void;
  createWorker: () => AcousticWorkerLike;
  onFallback: (frame: AcousticFrame) => void;
  onFrame: (frame: AcousticFrame) => void;
  schedule: (callback: () => void, delayMs: number) => unknown;
  scheduleFrame: (callback: () => void) => unknown;
}>;

export function acceptWorkerFrame<T extends { revision: number }>(
  frame: T,
  state: Readonly<{ revision: number; current: T | null }>,
): Readonly<{ revision: number; current: T | null }> {
  return frame.revision === state.revision
    ? { ...state, current: frame }
    : state;
}

export class AcousticFrameClient {
  private worker: AcousticWorkerLike | null = null;
  private pendingScene: SceneSpec | null = null;
  private postTimer: unknown | null = null;
  private frameTimer: unknown | null = null;
  private latestScene: SceneSpec | null = null;
  private usingFallback = false;
  private disposed = false;

  constructor(private readonly options: AcousticFrameClientOptions) {}

  start(scene: SceneSpec): void {
    if (this.disposed) return;
    this.latestScene = scene;
    try {
      const worker = this.options.createWorker();
      worker.onmessage = (event) => {
        if (event.data.type === "FRAME") {
          this.options.onFrame(event.data.frame);
          return;
        }
        this.activateFallback();
      };
      worker.onerror = () => this.activateFallback();
      worker.onmessageerror = () => this.activateFallback();
      this.worker = worker;
    } catch {
      this.activateFallback();
    }
  }

  updateScene(scene: SceneSpec): void {
    if (this.disposed) return;
    this.latestScene = scene;
    if (this.usingFallback) {
      this.deliverFallback();
      return;
    }
    if (!this.worker) return;
    this.pendingScene = scene;
    if (this.frameTimer !== null) return;
    if (this.postTimer !== null) this.options.cancel(this.postTimer);
    this.postTimer = this.options.schedule(() => {
      this.postTimer = null;
      if (this.usingFallback || this.disposed) return;
      this.frameTimer = this.options.scheduleFrame(() => {
        this.frameTimer = null;
        const pendingScene = this.pendingScene;
        this.pendingScene = null;
        if (pendingScene && this.worker && !this.usingFallback && !this.disposed) {
          this.worker.postMessage({ type: "UPDATE_SCENE", scene: pendingScene });
        }
      });
    }, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.postTimer !== null) this.options.cancel(this.postTimer);
    if (this.frameTimer !== null) this.options.cancelFrame(this.frameTimer);
    this.postTimer = null;
    this.frameTimer = null;
    this.pendingScene = null;
    if (this.worker) {
      this.worker.postMessage({ type: "DISPOSE" });
      this.worker.terminate();
      this.worker = null;
    }
  }

  private activateFallback(): void {
    if (this.disposed || this.usingFallback) return;
    this.usingFallback = true;
    if (this.postTimer !== null) this.options.cancel(this.postTimer);
    if (this.frameTimer !== null) this.options.cancelFrame(this.frameTimer);
    this.postTimer = null;
    this.frameTimer = null;
    this.pendingScene = null;
    this.worker?.terminate();
    this.worker = null;
    this.deliverFallback();
  }

  private deliverFallback(): void {
    if (this.latestScene) this.options.onFallback(computeAcousticFrame(this.latestScene));
  }
}

function createBrowserWorker(): AcousticWorkerLike {
  return new Worker(new URL("../workers/acoustics.worker.ts", import.meta.url));
}

function scheduleBrowserFrame(callback: () => void): unknown {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return setTimeout(callback, 16);
}

function cancelBrowserFrame(frame: unknown): void {
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(frame as number);
    return;
  }
  clearTimeout(frame as ReturnType<typeof setTimeout>);
}

export function useAcousticFrame(scene: SceneSpec): AcousticFrameResult {
  const latestScene = useRef(scene);
  const client = useRef<AcousticFrameClient | null>(null);
  const [state, setState] = useState<FrameState>({
    revision: scene.revision,
    current: null,
    fallbackNotice: null,
  });

  useEffect(() => {
    const frameClient = new AcousticFrameClient({
      cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      cancelFrame: cancelBrowserFrame,
      createWorker: createBrowserWorker,
      onFallback: (frame) => setState({
        revision: frame.revision,
        current: frame,
        fallbackNotice: FALLBACK_NOTICE,
      }),
      onFrame: (frame) => {
        if (frame.revision !== latestScene.current.revision) return;
        setState((current) => ({
          revision: frame.revision,
          current: acceptWorkerFrame(frame, {
            revision: frame.revision,
            current: current.current,
          }).current,
          fallbackNotice: null,
        }));
      },
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
      scheduleFrame: scheduleBrowserFrame,
    });
    client.current = frameClient;
    frameClient.start(latestScene.current);

    return () => {
      frameClient.dispose();
      client.current = null;
    };
  }, []);

  useEffect(() => {
    latestScene.current = scene;
    client.current?.updateScene(scene);
  }, [scene]);

  return {
    frame: state.revision === scene.revision ? state.current : null,
    fallbackNotice: state.fallbackNotice,
  };
}
