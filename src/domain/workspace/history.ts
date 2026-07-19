import { createDefaultClassicProject, createDefaultHybridProject } from "@/domain/workspace/defaults";
import type { ProjectAction, WorkspaceMode, WorkspaceProject } from "@/domain/workspace/types";

const HISTORY_LIMIT = 50;
type PathPart = string | number;

export type HistoryOperation =
  | Readonly<{
      kind: "value";
      path: readonly PathPart[];
      beforeExists: boolean;
      before: unknown;
      afterExists: boolean;
      after: unknown;
    }>
  | Readonly<{
      kind: "splice";
      path: readonly PathPart[];
      index: number;
      beforeItems: readonly unknown[];
      afterItems: readonly unknown[];
    }>;

export type HistoryPatch = Readonly<{ operations: readonly HistoryOperation[] }>;

export type HistoryState<T> = Readonly<{
  past: readonly HistoryPatch[];
  present: T;
  future: readonly HistoryPatch[];
}>;

export type WorkspaceHistories = Readonly<{
  classic: HistoryState<WorkspaceProject>;
  hybrid: HistoryState<WorkspaceProject>;
}>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function collectOperations(before: unknown, after: unknown, path: readonly PathPart[], operations: HistoryOperation[]): void {
  if (sameValue(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length === after.length) {
      for (let index = 0; index < before.length; index += 1) {
        collectOperations(before[index], after[index], [...path, index], operations);
      }
      return;
    }
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && sameValue(before[prefix], after[prefix])) prefix += 1;
    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      sameValue(before[before.length - 1 - suffix], after[after.length - 1 - suffix])
    ) suffix += 1;
    operations.push({
      kind: "splice",
      path,
      index: prefix,
      beforeItems: clone(before.slice(prefix, before.length - suffix)),
      afterItems: clone(after.slice(prefix, after.length - suffix)),
    });
    return;
  }
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const beforeExists = Object.hasOwn(before, key);
      const afterExists = Object.hasOwn(after, key);
      if (beforeExists && afterExists) collectOperations(before[key], after[key], [...path, key], operations);
      else operations.push({
        kind: "value",
        path: [...path, key],
        beforeExists,
        before: beforeExists ? clone(before[key]) : null,
        afterExists,
        after: afterExists ? clone(after[key]) : null,
      });
    }
    return;
  }
  operations.push({
    kind: "value",
    path,
    beforeExists: true,
    before: clone(before),
    afterExists: true,
    after: clone(after),
  });
}

export function createHistoryPatch<T>(before: T, after: T): HistoryPatch {
  const operations: HistoryOperation[] = [];
  collectOperations(before, after, [], operations);
  return { operations };
}

function valueAtPath(root: unknown, path: readonly PathPart[]): unknown {
  let current = root;
  for (const part of path) current = (current as Record<PathPart, unknown>)[part];
  return current;
}

export function applyHistoryPatch<T>(value: T, patch: HistoryPatch, direction: "forward" | "backward"): T {
  let result: unknown = clone(value);
  const operations = direction === "forward" ? patch.operations : [...patch.operations].reverse();
  for (const operation of operations) {
    if (operation.kind === "splice") {
      const target = valueAtPath(result, operation.path);
      if (!Array.isArray(target)) throw new Error("History splice target is not an array.");
      const removed = direction === "forward" ? operation.beforeItems : operation.afterItems;
      const inserted = direction === "forward" ? operation.afterItems : operation.beforeItems;
      target.splice(operation.index, removed.length, ...clone(inserted));
      continue;
    }
    const exists = direction === "forward" ? operation.afterExists : operation.beforeExists;
    const nextValue = direction === "forward" ? operation.after : operation.before;
    if (operation.path.length === 0) {
      if (!exists) throw new Error("History cannot remove its root value.");
      result = clone(nextValue);
      continue;
    }
    const parent = valueAtPath(result, operation.path.slice(0, -1));
    const key = operation.path.at(-1)!;
    if (Array.isArray(parent) && typeof key === "number") {
      if (exists) parent[key] = clone(nextValue);
      else parent.splice(key, 1);
    } else if (isObject(parent) && typeof key === "string") {
      if (exists) parent[key] = clone(nextValue);
      else delete parent[key];
    } else throw new Error("History value target is invalid.");
  }
  return result as T;
}

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
  const patch = createHistoryPatch(history.present, present);
  if (patch.operations.length === 0) return { ...history, present };
  return {
    past: [...history.past, patch].slice(-HISTORY_LIMIT),
    present,
    future: [],
  };
}

export function recordHistoryTransition<T>(history: HistoryState<T>, before: T): HistoryState<T> {
  const patch = createHistoryPatch(before, history.present);
  if (patch.operations.length === 0) return history;
  return {
    ...history,
    past: [...history.past, patch].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const patch = history.past.at(-1);
  if (patch === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: applyHistoryPatch(history.present, patch, "backward"),
    future: [patch, ...history.future],
  };
}

export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const patch = history.future[0];
  if (patch === undefined) return history;
  return {
    past: [...history.past, patch].slice(-HISTORY_LIMIT),
    present: applyHistoryPatch(history.present, patch, "forward"),
    future: history.future.slice(1),
  };
}

export function shouldRecordProjectAction(action: ProjectAction): boolean {
  if (action.type === "SELECT_ENTITY") return action.selection?.type === "listener";
  return !["SET_VIEW_STATE", "SET_LOCAL_AUDIO_METADATA", "CLEAR_NOTICE"].includes(action.type);
}

export function resetActiveMode(workspace: WorkspaceHistories, mode: WorkspaceMode): WorkspaceHistories {
  const key = mode === "classic-2d5d" ? "classic" : "hybrid";
  const nextProject = mode === "classic-2d5d" ? createDefaultClassicProject() : createDefaultHybridProject();
  const current = workspace[key];
  const patch = createHistoryPatch(current.present, nextProject);
  return {
    ...workspace,
    [key]: {
      past: [...current.past, patch].slice(-HISTORY_LIMIT),
      present: nextProject,
      future: [],
    },
  };
}
