"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createDefaultClassicProject, createDefaultHybridProject } from "@/domain/workspace/defaults";
import {
  createHistory,
  redoHistory,
  reduceWithHistory,
  resetActiveMode,
  shouldRecordProjectAction,
  undoHistory,
  type WorkspaceHistories,
} from "@/domain/workspace/history";
import {
  loadWorkspaceCache,
  saveWorkspaceCache,
  WORKSPACE_UI_KEY,
} from "@/domain/workspace/persistence";
import { projectReducer } from "@/domain/workspace/project-reducer";
import type { ProjectAction, WorkspaceMode } from "@/domain/workspace/types";

const initialHistories = (): WorkspaceHistories => ({
  classic: createHistory(createDefaultClassicProject()),
  hybrid: createHistory(createDefaultHybridProject()),
});

function restoredHistories(): WorkspaceHistories {
  if (typeof window === "undefined") return initialHistories();
  const classic = loadWorkspaceCache(window.localStorage, "classic-2d5d");
  const hybrid = loadWorkspaceCache(window.localStorage, "hybrid-3d");
  return { classic: createHistory(classic.project), hybrid: createHistory(hybrid.project) };
}

function restoredMode(): WorkspaceMode {
  if (typeof window === "undefined") return "classic-2d5d";
  const stored = window.localStorage.getItem(WORKSPACE_UI_KEY);
  return stored === "hybrid-3d" ? stored : "classic-2d5d";
}

export function useWorkspaceProjects() {
  const [activeMode, setActiveModeState] = useState<WorkspaceMode>(restoredMode);
  const [histories, setHistories] = useState<WorkspaceHistories>(restoredHistories);
  const [persistenceStatus, setPersistenceStatus] = useState("saved");

  const keyFor = useCallback((mode: WorkspaceMode) => mode === "classic-2d5d" ? "classic" : "hybrid", []);

  const flushMode = useCallback((mode: WorkspaceMode) => {
    const result = saveWorkspaceCache(window.localStorage, mode, histories[keyFor(mode)].present);
    setPersistenceStatus(result.ok ? "saved" : result.warning ?? "unavailable");
  }, [histories, keyFor]);

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
    flushMode(activeMode);
    window.localStorage.setItem(WORKSPACE_UI_KEY, mode);
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
          shouldRecordProjectAction(action),
        ),
      };
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

  const activeHistory = histories[keyFor(activeMode)];
  return useMemo(() => ({
    activeMode,
    setActiveMode,
    activeProject: activeHistory.present,
    dispatch,
    undo,
    redo,
    canUndo: activeHistory.past.length > 0,
    canRedo: activeHistory.future.length > 0,
    resetActiveProject,
    persistenceStatus,
  }), [activeHistory, activeMode, dispatch, persistenceStatus, redo, resetActiveProject, setActiveMode, undo]);
}
