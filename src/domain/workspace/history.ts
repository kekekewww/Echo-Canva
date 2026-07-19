import { createDefaultClassicProject, createDefaultHybridProject } from "@/domain/workspace/defaults";
import type { ProjectAction, WorkspaceMode, WorkspaceProject } from "@/domain/workspace/types";

const HISTORY_LIMIT = 50;

export type HistoryState<T> = Readonly<{
  past: readonly T[];
  present: T;
  future: readonly T[];
}>;

export type WorkspaceHistories = Readonly<{
  classic: HistoryState<WorkspaceProject>;
  hybrid: HistoryState<WorkspaceProject>;
}>;

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

export function reduceWithHistory<T, A>(
  history: HistoryState<T>,
  action: A,
  reducer: (state: T, action: A) => T,
  record = true,
): HistoryState<T> {
  const present = reducer(history.present, action);
  if (!record || present === history.present) return { ...history, present };
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
  };
}

export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: history.future.slice(1),
  };
}

export function shouldRecordProjectAction(action: ProjectAction): boolean {
  return !["SELECT_ENTITY", "SET_ACTIVE_LISTENER", "CLEAR_NOTICE"].includes(action.type);
}

export function resetActiveMode(
  workspace: WorkspaceHistories,
  mode: WorkspaceMode,
): WorkspaceHistories {
  const key = mode === "classic-2d5d" ? "classic" : "hybrid";
  const nextProject = mode === "classic-2d5d"
    ? createDefaultClassicProject()
    : createDefaultHybridProject();
  const current = workspace[key];
  return {
    ...workspace,
    [key]: {
      past: [...current.past, current.present].slice(-HISTORY_LIMIT),
      present: nextProject,
      future: [],
    },
  };
}
