import type {
  AuthoringListener,
  ProjectAction,
  WorkspaceNotice,
  WorkspaceProject,
} from "@/domain/workspace/types";
import { validateScene } from "@/domain/scene/validate";

const MAX_LISTENERS = 8;

function nextRevision(project: WorkspaceProject): number {
  return project.revision + 1;
}

function withNotice(project: WorkspaceProject, notice: WorkspaceNotice): WorkspaceProject {
  return { ...project, notice };
}

function chooseFallback(listeners: readonly AuthoringListener[]): AuthoringListener {
  return listeners.find(({ enabled }) => enabled) ?? listeners[0]!;
}

function commitScene(
  project: WorkspaceProject,
  mutate: (scene: WorkspaceProject["scene"]) => boolean | void,
): WorkspaceProject {
  const scene = structuredClone(project.scene);
  if (mutate(scene) === false) {
    return withNotice(project, { code: "entity_missing", message: "The selected object no longer exists." });
  }
  scene.revision = project.revision + 1;
  const validation = validateScene(scene);
  if (!validation.ok) {
    return withNotice(project, { code: "entity_missing", message: validation.errors[0]?.message ?? "Edit rejected." });
  }
  return { ...project, revision: scene.revision, scene: validation.scene, notice: null };
}

export function projectReducer(
  project: WorkspaceProject,
  action: ProjectAction,
): WorkspaceProject {
  switch (action.type) {
    case "ADD_LISTENER": {
      if (project.listeners.length >= MAX_LISTENERS) {
        return withNotice(project, {
          code: "limit_reached",
          message: "A project can contain at most eight listeners.",
        });
      }
      const listeners = [...project.listeners, { ...action.listener, enabled: true }];
      return {
        ...project,
        revision: nextRevision(project),
        listeners,
        activeListenerId: action.listener.id,
        selection: { type: "listener", id: action.listener.id },
        notice: null,
      };
    }

    case "DELETE_LISTENER": {
      if (!project.listeners.some(({ id }) => id === action.id)) {
        return withNotice(project, { code: "entity_missing", message: "Listener not found." });
      }
      if (project.listeners.length === 1) {
        return withNotice(project, {
          code: "listener_required",
          message: "Every project needs at least one listener.",
        });
      }
      const listeners = project.listeners.filter(({ id }) => id !== action.id);
      if (project.activeListenerId !== action.id) {
        return { ...project, revision: nextRevision(project), listeners, notice: null };
      }
      const fallback = chooseFallback(listeners);
      return {
        ...project,
        revision: nextRevision(project),
        listeners,
        activeListenerId: fallback.id,
        selection: { type: "listener", id: fallback.id },
        notice: null,
      };
    }

    case "SELECT_ENTITY": {
      if (action.selection?.type === "listener") {
        const listener = project.listeners.find(({ id }) => id === action.selection?.id);
        if (listener?.enabled) {
          return {
            ...project,
            activeListenerId: listener.id,
            selection: action.selection,
            notice: null,
          };
        }
      }
      return { ...project, selection: action.selection, notice: null };
    }

    case "SET_ACTIVE_LISTENER": {
      const listener = project.listeners.find(({ id }) => id === action.id && id.length > 0);
      if (!listener?.enabled) {
        return withNotice(project, { code: "entity_missing", message: "Enabled listener not found." });
      }
      return {
        ...project,
        activeListenerId: listener.id,
        selection: { type: "listener", id: listener.id },
        notice: null,
      };
    }

    case "SET_ENTITY_ENABLED": {
      const { entity, enabled } = action;
      if (entity.type === "surface" && entity.id === "floor" && !enabled) {
        return withNotice(project, {
          code: "floor_required",
          message: "The floor is required and cannot be disabled.",
        });
      }
      if (entity.type === "listener") {
        const target = project.listeners.find(({ id }) => id === entity.id);
        if (!target) {
          return withNotice(project, { code: "entity_missing", message: "Listener not found." });
        }
        const enabledCount = project.listeners.filter(({ enabled: itemEnabled }) => itemEnabled).length;
        if (!enabled && target.enabled && enabledCount === 1) {
          return withNotice(project, {
            code: "listener_required",
            message: "At least one listener must remain enabled.",
          });
        }
        const listeners = project.listeners.map((listener) =>
          listener.id === entity.id ? { ...listener, enabled } : listener,
        );
        if (!enabled && project.activeListenerId === entity.id) {
          const fallback = chooseFallback(listeners);
          return {
            ...project,
            revision: nextRevision(project),
            listeners,
            activeListenerId: fallback.id,
            selection: { type: "listener", id: fallback.id },
            notice: null,
          };
        }
        return { ...project, revision: nextRevision(project), listeners, notice: null };
      }

      const disabled = new Set(project.disabledEntityIds);
      if (enabled) disabled.delete(entity.id);
      else disabled.add(entity.id);
      return {
        ...project,
        revision: nextRevision(project),
        disabledEntityIds: [...disabled],
        notice: null,
      };
    }

    case "UPDATE_LISTENER": {
      const target = project.listeners.find(({ id }) => id === action.id);
      if (!target) return withNotice(project, { code: "entity_missing", message: "Listener not found." });
      return {
        ...project,
        revision: nextRevision(project),
        listeners: project.listeners.map((listener) => listener.id === action.id
          ? { ...listener, ...action.changes }
          : listener),
        notice: null,
      };
    }

    case "MOVE_SOURCE": {
      const next = commitScene(project, (scene) => {
        const source = scene.sources.find(({ id }) => id === action.id);
        if (!source) return false;
        source.position = { x: action.position.x, y: action.position.z };
      });
      if (next === project || next.scene === project.scene) return next;
      return {
        ...next,
        sourceHeightsM: { ...project.sourceHeightsM, [action.id]: action.position.y },
      };
    }

    case "ADD_SOURCE": {
      if (project.scene.sources.length >= 4) return withNotice(project, {
        code: "limit_reached",
        message: "A project can contain at most four point sources.",
      });
      const next = commitScene(project, (scene) => { scene.sources.push(structuredClone(action.source)); });
      if (next.scene === project.scene) return next;
      return {
        ...next,
        sourceHeightsM: { ...project.sourceHeightsM, [action.source.id]: action.heightM },
        selection: { type: "source", id: action.source.id },
      };
    }

    case "DELETE_SOURCE": {
      const next = commitScene(project, (scene) => {
        const index = scene.sources.findIndex(({ id }) => id === action.id);
        if (index < 0) return false;
        scene.sources.splice(index, 1);
      });
      if (next.scene === project.scene) return next;
      const sourceHeightsM = { ...project.sourceHeightsM };
      delete sourceHeightsM[action.id];
      return { ...next, sourceHeightsM, selection: null };
    }

    case "ADD_WALL": {
      const next = commitScene(project, (scene) => { scene.walls.push(structuredClone(action.wall)); });
      if (next.scene === project.scene) return next;
      return {
        ...next,
        wall3dById: {
          ...project.wall3dById,
          [action.wall.id]: action.vertical ?? {
            bottomM: 0,
            topM: project.room3d.heightM,
            thicknessM: action.wall.thicknessM,
          },
        },
        selection: { type: "wall", id: action.wall.id },
      };
    }

    case "UPDATE_WALL": {
      const next = commitScene(project, (scene) => {
        const wall = scene.walls.find(({ id }) => id === action.id);
        if (!wall) return false;
        Object.assign(wall, structuredClone(action.changes));
      });
      if (next.scene === project.scene || !action.vertical) return next;
      return {
        ...next,
        wall3dById: {
          ...project.wall3dById,
          [action.id]: { ...project.wall3dById[action.id]!, ...action.vertical },
        },
      };
    }

    case "DELETE_WALL": {
      const next = commitScene(project, (scene) => {
        const index = scene.walls.findIndex(({ id }) => id === action.id);
        if (index < 0) return false;
        scene.walls.splice(index, 1);
        scene.portals = scene.portals.filter(({ wallId }) => wallId !== action.id);
      });
      return next.scene === project.scene ? next : { ...next, selection: null };
    }

    case "ADD_PORTAL": {
      const next = commitScene(project, (scene) => { scene.portals.push(structuredClone(action.portal)); });
      if (next.scene === project.scene) return next;
      return {
        ...next,
        portal3dById: {
          ...project.portal3dById,
          [action.portal.id]: action.vertical ?? { bottomM: 0, topM: action.portal.heightM, thicknessM: 0.12 },
        },
        selection: { type: "portal", id: action.portal.id },
      };
    }

    case "UPDATE_PORTAL": {
      const next = commitScene(project, (scene) => {
        const portal = scene.portals.find(({ id }) => id === action.id);
        if (!portal) return false;
        Object.assign(portal, structuredClone(action.changes));
      });
      if (next.scene === project.scene || !action.vertical) return next;
      return {
        ...next,
        portal3dById: {
          ...project.portal3dById,
          [action.id]: { ...project.portal3dById[action.id]!, ...action.vertical },
        },
      };
    }

    case "DELETE_PORTAL": {
      const next = commitScene(project, (scene) => {
        const index = scene.portals.findIndex(({ id }) => id === action.id);
        if (index < 0) return false;
        scene.portals.splice(index, 1);
      });
      return next.scene === project.scene ? next : { ...next, selection: null };
    }

    case "SET_ROOM_3D": {
      const room3d = { ...project.room3d, ...action.changes };
      return {
        ...project,
        revision: nextRevision(project),
        room3d,
        scene: { ...project.scene, revision: nextRevision(project), room: { ...project.scene.room, heightM: room3d.heightM } },
        notice: null,
      };
    }

    case "SET_VIEW_STATE":
      return {
        ...project,
        view: {
          ...project.view,
          ...action.changes,
          camera: { ...project.view.camera, ...action.changes.camera },
          overlays: { ...project.view.overlays, ...action.changes.overlays },
          panels: { ...project.view.panels, ...action.changes.panels },
        },
      };

    case "REPLACE_SCENE": {
      const validation = validateScene(action.scene);
      if (!validation.ok) return withNotice(project, { code: "entity_missing", message: "Scene replacement failed validation." });
      const scene = structuredClone(validation.scene);
      scene.revision = nextRevision(project);
      const activeId = project.activeListenerId;
      return {
        ...project,
        revision: scene.revision,
        scene,
        listeners: project.listeners.map((listener) => listener.id === activeId ? {
          ...listener,
          position: { ...listener.position, x: scene.listener.position.x, z: scene.listener.position.y },
          headingDeg: scene.listener.headingDeg,
        } : listener),
        sourceHeightsM: Object.fromEntries(scene.sources.map(({ id }) => [id, project.sourceHeightsM[id] ?? 1.5])),
        wall3dById: Object.fromEntries(scene.walls.map(({ id, thicknessM }) => [id, project.wall3dById[id] ?? { bottomM: 0, topM: project.room3d.heightM, thicknessM }])),
        portal3dById: Object.fromEntries(scene.portals.map(({ id, heightM }) => [id, project.portal3dById[id] ?? { bottomM: 0, topM: heightM, thicknessM: 0.12 }])),
        disabledEntityIds: [],
        selection: null,
        notice: null,
      };
    }

    case "REPLACE_PROJECT":
      return action.project.mode === project.mode ? action.project : project;

    case "CLEAR_NOTICE":
      return { ...project, notice: null };
  }
}
