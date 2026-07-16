"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AudioEngine } from "@/audio/AudioEngine";
import type { AudioEngineDiagnostics } from "@/audio/types";
import type { PreviewMode } from "@/domain/editor/state";
import type { SceneSpec } from "@/domain/scene/types";

type AudioEngineControls = Readonly<{
  diagnostics: AudioEngineDiagnostics;
  startAudio: () => Promise<void>;
  stopAudio: () => Promise<void>;
}>;

export function useAudioEngine(scene: SceneSpec, mode: PreviewMode): AudioEngineControls {
  const [engine] = useState(() => new AudioEngine());
  const [diagnostics, setDiagnostics] = useState(() => engine.getDiagnostics());
  const mounted = useRef(true);
  const disposalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshDiagnostics = useCallback(() => {
    if (mounted.current) setDiagnostics(engine.getDiagnostics());
  }, [engine]);

  useEffect(() => {
    engine.setMode(mode);
    refreshDiagnostics();
  }, [engine, mode, refreshDiagnostics]);

  useEffect(() => {
    void engine.applyScene(scene).then(refreshDiagnostics, refreshDiagnostics);
  }, [engine, refreshDiagnostics, scene]);

  useEffect(() => {
    mounted.current = true;
    if (disposalTimer.current !== null) clearTimeout(disposalTimer.current);
    return () => {
      mounted.current = false;
      disposalTimer.current = setTimeout(() => void engine.dispose(), 0);
    };
  }, [engine]);

  const startAudio = useCallback(async () => {
    try {
      await engine.start(scene);
    } finally {
      refreshDiagnostics();
    }
  }, [engine, refreshDiagnostics, scene]);

  const stopAudio = useCallback(async () => {
    try {
      await engine.stop();
    } finally {
      refreshDiagnostics();
    }
  }, [engine, refreshDiagnostics]);

  return { diagnostics, startAudio, stopAudio };
}
