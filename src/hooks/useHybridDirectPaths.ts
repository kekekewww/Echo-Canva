"use client";

import { useEffect, useRef, useState } from "react";

import { computeHybridDirectFrame, type HybridDirectFrame } from "@/acoustics/hybrid3d/direct";
import type { HybridGeometry } from "@/acoustics/hybrid3d/compile";
import type { SceneDocumentV2 } from "@/domain/scene-document/types";
import type {
  HybridDirectWorkerRequest,
  HybridDirectWorkerResponse,
} from "@/workers/hybrid-direct.worker";

type HybridWorkerLike = {
  postMessage: (request: HybridDirectWorkerRequest) => void;
  terminate: () => void;
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessage: ((event: MessageEvent<HybridDirectWorkerResponse>) => unknown) | null;
};

function createWorker(): HybridWorkerLike {
  return new Worker(new URL("../workers/hybrid-direct.worker.ts", import.meta.url));
}

export type HybridDirectPathsState = Readonly<{
  frame: HybridDirectFrame;
  source: "worker" | "fallback";
  computeMs: number | null;
  notice: string | null;
}>;

export function useHybridDirectPaths(
  document: SceneDocumentV2,
  fallbackGeometry: HybridGeometry,
): HybridDirectPathsState {
  const requestId = useRef(0);
  const latestFallback = useRef(fallbackGeometry);
  const worker = useRef<HybridWorkerLike | null>(null);
  const [state, setState] = useState<HybridDirectPathsState>(() => ({
    frame: computeHybridDirectFrame(fallbackGeometry),
    source: "fallback",
    computeMs: null,
    notice: null,
  }));

  useEffect(() => {
    try {
      const instance = createWorker();
      instance.onmessage = (event) => {
        if (event.data.type !== "FRAME" || event.data.requestId !== requestId.current) return;
        setState({
          frame: event.data.frame,
          source: "worker",
          computeMs: event.data.computeMs,
          notice: null,
        });
      };
      instance.onerror = () => {
        setState({
          frame: computeHybridDirectFrame(latestFallback.current),
          source: "fallback",
          computeMs: null,
          notice: "Hybrid Worker unavailable; using the deterministic Lab fallback.",
        });
      };
      worker.current = instance;
      return () => {
        instance.postMessage({ type: "DISPOSE" });
        instance.terminate();
        worker.current = null;
      };
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    latestFallback.current = fallbackGeometry;
    requestId.current += 1;
    const currentRequest = requestId.current;
    if (!worker.current) {
      setState({
        frame: computeHybridDirectFrame(fallbackGeometry),
        source: "fallback",
        computeMs: null,
        notice: "Hybrid Worker unavailable; using the deterministic Lab fallback.",
      });
      return;
    }
    worker.current.postMessage({ type: "COMPUTE", requestId: currentRequest, document });
  }, [document, fallbackGeometry]);

  return state;
}
