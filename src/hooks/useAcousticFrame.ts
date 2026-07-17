"use client";

import { useEffect, useRef, useState } from "react";

import { computeAcousticFrame, type AcousticFrame } from "@/acoustics/compute-frame";
import type { SceneSpec } from "@/domain/scene/types";
import type {
  AcousticWorkerRequest,
  AcousticWorkerResponse,
} from "@/workers/acoustics.worker";

type FrameState = Readonly<{
  revision: number;
  current: AcousticFrame | null;
  fallbackNotice: string | null;
}>;

export type AcousticFrameResult = Readonly<{
  frame: AcousticFrame | null;
  fallbackNotice: string | null;
}>;

export function acceptWorkerFrame<T extends { revision: number }>(
  frame: T,
  state: Readonly<{ revision: number; current: T | null }>,
): Readonly<{ revision: number; current: T | null }> {
  return frame.revision === state.revision
    ? { ...state, current: frame }
    : state;
}

export function useAcousticFrame(scene: SceneSpec): AcousticFrameResult {
  const latestScene = useRef(scene);
  const worker = useRef<Worker | null>(null);
  const usingFallback = useRef(false);
  const [state, setState] = useState<FrameState>({
    revision: scene.revision,
    current: null,
    fallbackNotice: null,
  });

  useEffect(() => {
    try {
      const acousticWorker = new Worker(
        new URL("../workers/acoustics.worker.ts", import.meta.url),
      );
      worker.current = acousticWorker;
      acousticWorker.onmessage = (event: MessageEvent<AcousticWorkerResponse>) => {
        const response = event.data;
        if (response.type === "FRAME") {
          setState((current) => {
            const accepted = acceptWorkerFrame(response.frame, current);
            return { ...current, current: accepted.current };
          });
          return;
        }
        if (response.revision === latestScene.current.revision) {
          usingFallback.current = true;
          const frame = computeAcousticFrame(latestScene.current);
          setState({
            revision: frame.revision,
            current: frame,
            fallbackNotice: "Worker unavailable; using deterministic main-thread acoustic updates.",
          });
        }
      };
    } catch {
      usingFallback.current = true;
      const frame = computeAcousticFrame(latestScene.current);
      setState({
        revision: frame.revision,
        current: frame,
        fallbackNotice: "Worker unavailable; using deterministic main-thread acoustic updates.",
      });
    }

    return () => {
      worker.current?.postMessage({ type: "DISPOSE" } satisfies AcousticWorkerRequest);
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    latestScene.current = scene;
    setState((current) => ({
      revision: scene.revision,
      current: current.revision === scene.revision ? current.current : null,
      fallbackNotice: usingFallback.current ? current.fallbackNotice : null,
    }));

    if (usingFallback.current || worker.current === null) {
      const frame = computeAcousticFrame(scene);
      setState({
        revision: scene.revision,
        current: frame,
        fallbackNotice: "Worker unavailable; using deterministic main-thread acoustic updates.",
      });
      return;
    }

    worker.current.postMessage({ type: "UPDATE_SCENE", scene } satisfies AcousticWorkerRequest);
  }, [scene]);

  return { frame: state.current, fallbackNotice: state.fallbackNotice };
}
