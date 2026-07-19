"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createDefaultClassicProject, createDefaultHybridProject } from "@/domain/workspace/defaults";
import {
  createHistory,
  redoHistory,
  reduceWithHistory,
  recordHistoryTransition,
  resetActiveMode,
  shouldRecordProjectAction,
  undoHistory,
  type WorkspaceHistories,
} from "@/domain/workspace/history";
import {
  loadWorkspaceCache,
  saveWorkspaceCache,
  WORKSPACE_UI_KEY,
  CLASSIC_PROJECT_KEY,
  HYBRID_PROJECT_KEY,
} from "@/domain/workspace/persistence";
import { projectReducer } from "@/domain/workspace/project-reducer";
import type { ProjectAction, WorkspaceMode } from "@/domain/workspace/types";

const initialHistories = (): WorkspaceHistories => ({
  classic: createHistory(createDefaultClassicProject()),
  hybrid: createHistory(createDefaultHybridProject()),
});

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  if ((window as Window & { __echoCanvasSimulateStorageFailure?: boolean }).__echoCanvasSimulateStorageFailure) return null;
  try { return window.localStorage; } catch { return null; }
}

function restoredHistories(): WorkspaceHistories {
  if (typeof window === "undefined") return initialHistories();
  const storage = browserStorage();
  const classic = loadWorkspaceCache(storage, "classic-2d5d");
  const hybrid = loadWorkspaceCache(storage, "hybrid-3d");
  return { classic: classic.history, hybrid: hybrid.history };
}

function restoredMode(fallback: WorkspaceMode): WorkspaceMode {
  if (typeof window === "undefined") return fallback;
  if (!browserStorage()) return fallback;
  let stored: string | null = null;
  try { stored = window.localStorage.getItem(WORKSPACE_UI_KEY); } catch { return fallback; }
  return stored === "classic-2d5d" || stored === "hybrid-3d" ? stored : fallback;
}

function restorationReport(): Readonly<{
  status: string;
  recoveryRaw: Partial<Record<WorkspaceMode, string>>;
}> {
  if (typeof window === "undefined") return { status: "saved", recoveryRaw: {} };
  const storage = browserStorage();
  const classic = loadWorkspaceCache(storage, "classic-2d5d");
  const hybrid = loadWorkspaceCache(storage, "hybrid-3d");
  const warnings = [classic.warning, hybrid.warning].filter(Boolean);
  return {
    status: warnings[0] ?? "saved",
    recoveryRaw: {
      ...(classic.recoveryRaw ? { "classic-2d5d": classic.recoveryRaw } : {}),
      ...(hybrid.recoveryRaw ? { "hybrid-3d": hybrid.recoveryRaw } : {}),
    },
  };
}

export function useWorkspaceProjects(initialMode?: WorkspaceMode) {
  const [activeMode, setActiveModeState] = useState<WorkspaceMode>(() => initialMode ?? restoredMode("classic-2d5d"));
  const [histories, setHistories] = useState<WorkspaceHistories>(restoredHistories);
  const [restoration] = useState(restorationReport);
  const [persistenceStatus, setPersistenceStatus] = useState(restoration.status);
  const historiesRef = useRef(histories);
  const transactionRef = useRef<Readonly<{ mode: WorkspaceMode; before: (typeof histories)["classic"]["present"] }> | null>(null);
  useEffect(() => {
    historiesRef.current = histories;
  }, [histories]);

  const keyFor = useCallback((mode: WorkspaceMode) => mode === "classic-2d5d" ? "classic" : "hybrid", []);

  const flushMode = useCallback((mode: WorkspaceMode) => {
    const storage = browserStorage();
    const result = saveWorkspaceCache(storage, mode, historiesRef.current[keyFor(mode)]);
    setPersistenceStatus(result.ok ? "saved" : result.warning ?? "unavailable");
  }, [keyFor]);

  useEffect(() => {
    const timer = window.setTimeout(() => flushMode(activeMode), 150);
    return () => window.clearTimeout(timer);
  }, [activeMode, flushMode, histories]);

  useEffect(() => {
    const flush = () => flushMode(activeMode);
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [activeMode, flushMode]);

  const setActiveMode = useCallback((mode: WorkspaceMode) => {
    if (mode === activeMode) return;
    flushMode(activeMode);
    try { window.localStorage.setItem(WORKSPACE_UI_KEY, mode); } catch { setPersistenceStatus("Local persistence is unavailable."); }
    setActiveModeState(mode);
  }, [activeMode, flushMode]);

  const dispatch = useCallback((action: ProjectAction) => {
    setHistories((current) => {
      const key = keyFor(activeMode);
      return {
        ...current,
        [key]: reduceWithHistory(
          current[key],
          action,
          projectReducer,
          shouldRecordProjectAction(action) && transactionRef.current?.mode !== activeMode,
        ),
      };
    });
  }, [activeMode, keyFor]);

  const beginHistoryTransaction = useCallback(() => {
    if (transactionRef.current) return;
    transactionRef.current = {
      mode: activeMode,
      before: historiesRef.current[keyFor(activeMode)].present,
    };
  }, [activeMode, keyFor]);

  const endHistoryTransaction = useCallback(() => {
    const transaction = transactionRef.current;
    transactionRef.current = null;
    if (!transaction || transaction.mode !== activeMode) return;
    setHistories((current) => {
      const key = keyFor(activeMode);
      return { ...current, [key]: recordHistoryTransition(current[key], transaction.before) };
    });
  }, [activeMode, keyFor]);

  const undo = useCallback(() => setHistories((current) => {
    const key = keyFor(activeMode);
    return { ...current, [key]: undoHistory(current[key]) };
  }), [activeMode, keyFor]);

  const redo = useCallback(() => setHistories((current) => {
    const key = keyFor(activeMode);
    return { ...current, [key]: redoHistory(current[key]) };
  }), [activeMode, keyFor]);

  const resetActiveProject = useCallback(() => {
    setHistories((current) => resetActiveMode(current, activeMode));
  }, [activeMode]);

  const clearAllProjects = useCallback(() => {
    setHistories(initialHistories());
    try {
      window.localStorage.removeItem(CLASSIC_PROJECT_KEY);
      window.localStorage.removeItem(HYBRID_PROJECT_KEY);
      window.localStorage.removeItem(WORKSPACE_UI_KEY);
      setPersistenceStatus("saved");
    } catch {
      setPersistenceStatus("Local persistence is unavailable.");
    }
  }, []);

  const activeHistory = histories[keyFor(activeMode)];
  return useMemo(() => ({
    activeMode,
    setActiveMode,
    activeProject: activeHistory.present,
    dispatch,
    beginHistoryTransaction,
    endHistoryTransaction,
    undo,
    redo,
    canUndo: activeHistory.past.length > 0,
    canRedo: activeHistory.future.length > 0,
    resetActiveProject,
    clearAllProjects,
    persistenceStatus,
    recoveryRaw: restoration.recoveryRaw[activeMode] ?? null,
  }), [activeHistory, activeMode, beginHistoryTransaction, clearAllProjects, dispatch, endHistoryTransaction, persistenceStatus, redo, resetActiveProject, restoration.recoveryRaw, setActiveMode, undo]);
}
