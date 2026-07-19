import { z } from "zod";

import { validateScene } from "@/domain/scene/validate";
import {
  createDefaultClassicProject,
  createDefaultHybridProject,
} from "@/domain/workspace/defaults";
import type { WorkspaceMode, WorkspaceProject } from "@/domain/workspace/types";

export const CLASSIC_PROJECT_KEY = "echo-canvas:project:classic:v1";
export const HYBRID_PROJECT_KEY = "echo-canvas:project:hybrid:v1";
export const WORKSPACE_UI_KEY = "echo-canvas:workspace-ui:v1";

const vec3Schema = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }).strict();
const listenerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: vec3Schema,
  headingDeg: z.number().finite(),
  enabled: z.boolean(),
}).strict();
const selectionSchema = z.object({
  type: z.enum(["listener", "source", "wall", "portal", "surface"]),
  id: z.string().min(1),
}).strict().nullable();
const projectEnvelopeSchema = z.object({
  schemaVersion: z.literal("1.0"),
  mode: z.enum(["classic-2d5d", "hybrid-3d"]),
  revision: z.number().int().nonnegative(),
  scene: z.unknown(),
  listeners: z.array(listenerSchema).min(1).max(8),
  activeListenerId: z.string().min(1),
  disabledEntityIds: z.array(z.string()),
  selection: selectionSchema,
  room3d: z.object({
    widthM: z.number().min(0.1).max(50),
    depthM: z.number().min(0.1).max(50),
    heightM: z.number().min(0.1).max(12),
  }).strict(),
  sourceHeightsM: z.record(z.string(), z.number().finite()),
  notice: z.object({ code: z.string(), message: z.string() }).nullable(),
}).strict();

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type CacheLoadResult = Readonly<{
  project: WorkspaceProject;
  warning: string | null;
  persistenceAvailable: boolean;
}>;

export type CacheSaveResult = Readonly<{
  ok: boolean;
  warning: string | null;
}>;

export function projectStorageKey(mode: WorkspaceMode): string {
  return mode === "classic-2d5d" ? CLASSIC_PROJECT_KEY : HYBRID_PROJECT_KEY;
}

function defaultProject(mode: WorkspaceMode): WorkspaceProject {
  return mode === "classic-2d5d"
    ? createDefaultClassicProject()
    : createDefaultHybridProject();
}

export function migrateWorkspaceCache(input: unknown, mode: WorkspaceMode): WorkspaceProject | null {
  const parsed = projectEnvelopeSchema.safeParse(input);
  if (!parsed.success || parsed.data.mode !== mode) return null;
  const scene = validateScene(parsed.data.scene);
  if (!scene.ok) return null;
  const active = parsed.data.listeners.find(
    ({ id, enabled }) => id === parsed.data.activeListenerId && enabled,
  );
  if (!active) return null;
  return {
    ...(parsed.data as Omit<WorkspaceProject, "scene" | "notice">),
    scene: scene.scene,
    notice: null,
  };
}

export function loadWorkspaceCache(
  storage: StorageLike | null | undefined,
  mode: WorkspaceMode,
): CacheLoadResult {
  if (!storage) {
    return { project: defaultProject(mode), warning: null, persistenceAvailable: false };
  }
  try {
    const raw = storage.getItem(projectStorageKey(mode));
    if (raw === null) {
      return { project: defaultProject(mode), warning: null, persistenceAvailable: true };
    }
    const project = migrateWorkspaceCache(JSON.parse(raw) as unknown, mode);
    if (!project) {
      return {
        project: defaultProject(mode),
        warning: "This project cache could not be restored. A safe default was loaded.",
        persistenceAvailable: true,
      };
    }
    return { project, warning: null, persistenceAvailable: true };
  } catch {
    return {
      project: defaultProject(mode),
      warning: "This project cache could not be restored. A safe default was loaded.",
      persistenceAvailable: true,
    };
  }
}

export function saveWorkspaceCache(
  storage: StorageLike | null | undefined,
  mode: WorkspaceMode,
  project: WorkspaceProject,
): CacheSaveResult {
  if (!storage) return { ok: false, warning: "Local persistence is unavailable." };
  try {
    storage.setItem(projectStorageKey(mode), JSON.stringify(project));
    return { ok: true, warning: null };
  } catch {
    return { ok: false, warning: "This project could not be saved locally." };
  }
}
