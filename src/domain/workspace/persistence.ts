import { z } from "zod";

import { isSceneDocumentV2, validateSceneDocument } from "@/domain/scene-document/validate";
import type { SceneSpec } from "@/domain/scene/types";
import { validateScene } from "@/domain/scene/validate";
import {
  createDefaultClassicProject,
  createDefaultHybridProject,
} from "@/domain/workspace/defaults";
import { applyHistoryPatch, createHistory, createHistoryPatch, type HistoryPatch, type HistoryState } from "@/domain/workspace/history";
import type { WorkspaceMode, WorkspaceProject, WorkspaceViewState } from "@/domain/workspace/types";

export const CLASSIC_PROJECT_KEY = "echo-canvas:project:classic:v1";
export const HYBRID_PROJECT_KEY = "echo-canvas:project:hybrid:v1";
export const WORKSPACE_UI_KEY = "echo-canvas:workspace-ui:v1";
export const WORKSPACE_CACHE_VERSION = "3.0";

const vec3Schema = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }).strict();
const listenerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: vec3Schema,
  headingDeg: z.number().finite(),
  enabled: z.boolean(),
}).strict();
const selectionSchema = z.object({
  type: z.enum(["listener", "source", "wall", "portal", "primitive", "surface"]),
  id: z.string().min(1),
}).strict().nullable();
const viewSchema = z.object({
  camera: z.object({
    yawDeg: z.number().finite(),
    pitchDeg: z.number().finite(),
    zoom: z.number().finite().positive(),
    panX: z.number().finite().optional(),
    panY: z.number().finite().optional(),
  }).strict(),
  overlays: z.object({
    pathsVisible: z.boolean(),
    showAllPaths: z.boolean(),
    ceilingVisible: z.boolean(),
  }).strict(),
  panels: z.object({
    outlinerCollapsed: z.boolean(),
    inspectorCollapsed: z.boolean(),
  }).strict(),
}).strict();
const projectEnvelopeSchema = z.object({
  schemaVersion: z.enum(["1.0", "2.0"]),
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
    floorMaterialId: z.string().optional(),
    ceilingMaterialId: z.string().optional(),
    ceilingEnabled: z.boolean().optional(),
  }).strict(),
  sourceHeightsM: z.record(z.string(), z.number().finite()),
  wall3dById: z.record(z.string(), z.object({
    bottomM: z.number().finite(),
    topM: z.number().finite(),
    thicknessM: z.number().finite(),
  }).strict()),
  portal3dById: z.record(z.string(), z.object({
    bottomM: z.number().finite(),
    topM: z.number().finite(),
    thicknessM: z.number().finite(),
  }).strict()),
  primitives: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    kind: z.enum(["box", "cylinder", "sphere"]),
    position: vec3Schema,
    dimensions: vec3Schema,
    rotationYDeg: z.number().finite(),
    materialId: z.string().min(1),
  }).strict()).max(8).optional(),
  missingAudioAssetIds: z.array(z.string()).optional(),
  localAudioMetadata: z.record(z.string(), z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(120),
    mimeType: z.string().min(1),
    size: z.number().int().nonnegative(),
    createdAt: z.number().finite(),
  }).strict()).optional(),
  view: viewSchema.optional(),
  notice: z.object({ code: z.string(), message: z.string() }).nullable(),
}).strict();
const pathSchema = z.array(z.union([z.string(), z.number().int().nonnegative()]));
const historyOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("value"),
    path: pathSchema,
    beforeExists: z.boolean(),
    before: z.unknown(),
    afterExists: z.boolean(),
    after: z.unknown(),
  }).strict(),
  z.object({
    kind: z.literal("splice"),
    path: pathSchema,
    index: z.number().int().nonnegative(),
    beforeItems: z.array(z.unknown()),
    afterItems: z.array(z.unknown()),
  }).strict(),
]);
const historyPatchSchema = z.object({ operations: z.array(historyOperationSchema).min(1) }).strict();
const cacheDocumentSchema = z.object({
  cacheVersion: z.literal(WORKSPACE_CACHE_VERSION),
  mode: z.enum(["classic-2d5d", "hybrid-3d"]),
  present: z.unknown(),
  past: z.array(historyPatchSchema).max(50),
  future: z.array(historyPatchSchema).max(50),
}).strict();
const legacyCacheDocumentSchema = z.object({
  cacheVersion: z.literal("2.0"),
  mode: z.enum(["classic-2d5d", "hybrid-3d"]),
  present: z.unknown(),
  past: z.array(z.unknown()).max(50),
  future: z.array(z.unknown()).max(50),
}).strict();

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type CacheLoadResult = Readonly<{
  project: WorkspaceProject;
  history: HistoryState<WorkspaceProject>;
  warning: string | null;
  persistenceAvailable: boolean;
  recoveryRaw: string | null;
}>;

export type CacheSaveResult = Readonly<{ ok: boolean; warning: string | null }>;

export function projectStorageKey(mode: WorkspaceMode): string {
  return mode === "classic-2d5d" ? CLASSIC_PROJECT_KEY : HYBRID_PROJECT_KEY;
}

function defaultProject(mode: WorkspaceMode): WorkspaceProject {
  return mode === "classic-2d5d" ? createDefaultClassicProject() : createDefaultHybridProject();
}

function defaultView(mode: WorkspaceMode): WorkspaceViewState {
  return defaultProject(mode).view;
}

function migrateView(
  view: z.infer<typeof viewSchema> | undefined,
  mode: WorkspaceMode,
): WorkspaceViewState {
  const fallback = defaultView(mode);
  if (!view) return fallback;
  return {
    ...view,
    camera: {
      ...view.camera,
      panX: view.camera.panX ?? 0,
      panY: view.camera.panY ?? 0,
    },
  };
}

function projectFromScene(scene: SceneSpec, mode: WorkspaceMode): WorkspaceProject {
  const project = defaultProject(mode);
  const firstListener = project.listeners[0]!;
  return {
    ...project,
    revision: scene.revision,
    scene: structuredClone(scene),
    listeners: [{
      ...firstListener,
      position: { x: scene.listener.position.x, y: firstListener.position.y, z: scene.listener.position.y },
      headingDeg: scene.listener.headingDeg,
    }],
    sourceHeightsM: Object.fromEntries(scene.sources.map(({ id }) => [id, 1.5])),
    wall3dById: Object.fromEntries(scene.walls.map(({ id, thicknessM }) => [id, {
      bottomM: 0,
      topM: scene.room.heightM,
      thicknessM,
    }])),
    portal3dById: Object.fromEntries(scene.portals.map(({ id, heightM }) => [id, {
      bottomM: 0,
      topM: heightM,
      thicknessM: 0.12,
    }])),
  };
}

function migrateProjectCandidate(input: unknown, mode: WorkspaceMode): WorkspaceProject | null {
  const currentCache = cacheDocumentSchema.safeParse(input);
  const legacyCache = legacyCacheDocumentSchema.safeParse(input);
  const candidate = currentCache.success ? currentCache.data.present : legacyCache.success ? legacyCache.data.present : input;
  const parsedProject = projectEnvelopeSchema.safeParse(candidate);
  if (parsedProject.success && parsedProject.data.mode === mode) {
    const scene = validateScene(parsedProject.data.scene);
    if (!scene.ok) return null;
    const active = parsedProject.data.listeners.find(
      ({ id, enabled }) => id === parsedProject.data.activeListenerId && enabled,
    );
    if (!active) return null;
    return {
      ...(parsedProject.data as Omit<WorkspaceProject, "schemaVersion" | "scene" | "notice" | "view" | "missingAudioAssetIds" | "localAudioMetadata" | "room3d">),
      schemaVersion: "2.0",
      scene: scene.scene,
      room3d: {
        ...parsedProject.data.room3d,
        floorMaterialId: parsedProject.data.room3d.floorMaterialId ?? scene.scene.room.floorMaterialId,
        ceilingMaterialId: parsedProject.data.room3d.ceilingMaterialId ?? scene.scene.room.ceilingMaterialId,
        ceilingEnabled: parsedProject.data.room3d.ceilingEnabled ?? !parsedProject.data.disabledEntityIds.includes("ceiling"),
      },
      view: migrateView(parsedProject.data.view, mode),
      missingAudioAssetIds: parsedProject.data.missingAudioAssetIds ?? [],
      localAudioMetadata: parsedProject.data.localAudioMetadata ?? {},
      primitives: parsedProject.data.primitives ?? [],
      notice: null,
    };
  }

  const document = validateSceneDocument(candidate);
  if (!document.ok) return null;
  if (isSceneDocumentV2(document.document)) {
    if (mode !== "hybrid-3d") return null;
    const project = projectFromScene(document.document.baseScene, mode);
    const spatial = document.document.extensions.spatial3d;
    if (!spatial) return project;
    return {
      ...project,
      listeners: project.listeners.map((listener, index) => index === 0 ? {
        ...listener,
        position: { ...listener.position, y: spatial.listenerHeightM },
      } : listener),
      sourceHeightsM: { ...project.sourceHeightsM, ...spatial.sourceHeightsM },
      wall3dById: Object.fromEntries(project.scene.walls.map((wall) => {
        const vertical = spatial.wallVerticalBoundsM?.[wall.id];
        return [wall.id, {
          bottomM: vertical?.bottomM ?? 0,
          topM: vertical?.topM ?? project.room3d.heightM,
          thicknessM: wall.thicknessM,
        }];
      })),
      portal3dById: Object.fromEntries(project.scene.portals.map((portal) => {
        const vertical = spatial.portalVerticalBoundsM?.[portal.id];
        return [portal.id, {
          bottomM: vertical?.bottomM ?? 0,
          topM: vertical?.topM ?? portal.heightM,
          thicknessM: vertical?.thicknessM ?? 0.12,
        }];
      })),
      disabledEntityIds: spatial.disabledSurfaceIds ?? [],
      primitives: spatial.primitives ?? [],
    };
  }
  if (mode !== "classic-2d5d") return null;
  return projectFromScene(document.document, mode);
}

export function migrateWorkspaceCache(input: unknown, mode: WorkspaceMode): WorkspaceProject | null {
  return migrateProjectCandidate(input, mode);
}

function migrateHistory(input: unknown, mode: WorkspaceMode): HistoryState<WorkspaceProject> | null {
  const cache = cacheDocumentSchema.safeParse(input);
  if (cache.success && cache.data.mode === mode) {
    const present = migrateProjectCandidate(cache.data.present, mode);
    if (!present) return null;
    try {
      let cursor = present;
      for (const patch of [...cache.data.past].reverse()) cursor = applyHistoryPatch(cursor, patch as HistoryPatch, "backward");
      cursor = present;
      for (const patch of cache.data.future) cursor = applyHistoryPatch(cursor, patch as HistoryPatch, "forward");
      return { present, past: cache.data.past as readonly HistoryPatch[], future: cache.data.future as readonly HistoryPatch[] };
    } catch {
      return null;
    }
  }
  const legacy = legacyCacheDocumentSchema.safeParse(input);
  if (!legacy.success || legacy.data.mode !== mode) {
    const project = migrateProjectCandidate(input, mode);
    return project ? createHistory(project) : null;
  }
  const present = migrateProjectCandidate(legacy.data.present, mode);
  if (!present) return null;
  const migrateList = (items: readonly unknown[]) => items
    .map((item) => migrateProjectCandidate(item, mode))
    .filter((item): item is WorkspaceProject => item !== null)
    .slice(-50);
  const pastStates = migrateList(legacy.data.past);
  const futureStates = migrateList(legacy.data.future);
  const chronological = [...pastStates, present];
  const past = chronological.slice(0, -1).map((state, index) => createHistoryPatch(state, chronological[index + 1]!));
  const future: HistoryPatch[] = [];
  let cursor = present;
  for (const state of futureStates) {
    future.push(createHistoryPatch(cursor, state));
    cursor = state;
  }
  return { present, past, future };
}

export function loadWorkspaceCache(storage: StorageLike | null | undefined, mode: WorkspaceMode): CacheLoadResult {
  const fallback = createHistory(defaultProject(mode));
  if (!storage) return {
    project: fallback.present,
    history: fallback,
    warning: "Local persistence is unavailable.",
    persistenceAvailable: false,
    recoveryRaw: null,
  };
  let raw: string | null = null;
  try {
    raw = storage.getItem(projectStorageKey(mode));
    if (raw === null) return {
      project: fallback.present,
      history: fallback,
      warning: null,
      persistenceAvailable: true,
      recoveryRaw: null,
    };
    const parsed = JSON.parse(raw) as unknown;
    const history = migrateHistory(parsed, mode);
    if (!history) throw new Error("migration failed");
    const isCurrent = cacheDocumentSchema.safeParse(parsed).success;
    return {
      project: history.present,
      history,
      warning: isCurrent ? null : "A previous scene document was migrated to the current authoring format.",
      persistenceAvailable: true,
      recoveryRaw: null,
    };
  } catch {
    return {
      project: fallback.present,
      history: fallback,
      warning: "This project cache could not be restored. A safe default was loaded.",
      persistenceAvailable: true,
      recoveryRaw: raw,
    };
  }
}

export function saveWorkspaceCache(
  storage: StorageLike | null | undefined,
  mode: WorkspaceMode,
  value: WorkspaceProject | HistoryState<WorkspaceProject>,
): CacheSaveResult {
  if (!storage) return { ok: false, warning: "Local persistence is unavailable." };
  const history = "present" in value ? value : createHistory(value);
  const document = {
    cacheVersion: WORKSPACE_CACHE_VERSION,
    mode,
    present: history.present,
    past: history.past.slice(-50),
    future: history.future.slice(0, 50),
  } as const;
  try {
    storage.setItem(projectStorageKey(mode), JSON.stringify(document));
    return { ok: true, warning: null };
  } catch {
    return { ok: false, warning: "This project could not be saved locally." };
  }
}
