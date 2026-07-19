import type {
  AuthoringListener,
  ProjectAction,
  WorkspaceNotice,
  WorkspaceProject,
} from "@/domain/workspace/types";

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

    case "CLEAR_NOTICE":
      return { ...project, notice: null };
  }
}
