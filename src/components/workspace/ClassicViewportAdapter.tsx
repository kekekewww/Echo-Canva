"use client";

import { useEffect, useMemo } from "react";

import { SceneEditor } from "@/components/workbench/SceneEditor";
import type { EditorAction } from "@/domain/editor/reducer";
import type { EditorSelection } from "@/domain/editor/state";
import { projectClassicScene } from "@/domain/workspace/projections";
import type { ProjectAction, WorkspaceProject } from "@/domain/workspace/types";
import { useAcousticFrame } from "@/hooks/useAcousticFrame";
import type { AudioEngine } from "@/audio/AudioEngine";

export function ClassicViewportAdapter({ project, dispatch, audioEngine }: Readonly<{
  project: WorkspaceProject;
  dispatch: (action: ProjectAction) => void;
  audioEngine: AudioEngine;
}>) {
  const scene = useMemo(() => projectClassicScene(project), [project]);
  const acoustic = useAcousticFrame(scene);
  useEffect(() => {
    if (acoustic.frame) audioEngine.applyAcousticFrame(acoustic.frame);
  }, [acoustic.frame, audioEngine]);
  const selection: EditorSelection = project.selection?.type === "listener"
    ? { type: "listener" }
    : project.selection?.type === "source" || project.selection?.type === "wall" || project.selection?.type === "portal"
      ? { type: project.selection.type, id: project.selection.id }
      : null;

  function adapt(action: EditorAction): void {
    switch (action.type) {
      case "SELECT_OBJECT":
        dispatch({ type: "SELECT_ENTITY", selection: action.selection?.type === "listener"
          ? { type: "listener", id: project.activeListenerId }
          : action.selection });
        break;
      case "MOVE_LISTENER": {
        const listener = project.listeners.find(({ id }) => id === project.activeListenerId)!;
        dispatch({ type: "UPDATE_LISTENER", id: listener.id, changes: {
          position: { ...listener.position, x: action.position.x, z: action.position.y },
        } });
        break;
      }
      case "MOVE_SOURCE":
        dispatch({ type: "MOVE_SOURCE", id: action.sourceId, position: {
          x: action.position.x,
          y: project.sourceHeightsM[action.sourceId] ?? 1.5,
          z: action.position.y,
        } });
        break;
      case "ADD_WALL": dispatch({ type: "ADD_WALL", wall: action.wall }); break;
      case "MOVE_WALL_ENDPOINT": dispatch({ type: "UPDATE_WALL", id: action.wallId, changes: { [action.endpoint]: action.position } }); break;
      case "DELETE_WALL": dispatch({ type: "DELETE_WALL", id: action.wallId }); break;
      case "SET_WALL_MATERIAL": dispatch({ type: "UPDATE_WALL", id: action.wallId, changes: { materialId: action.materialId } }); break;
      case "TOGGLE_PORTAL": {
        const portal = project.scene.portals.find(({ id }) => id === action.portalId);
        if (portal) dispatch({ type: "UPDATE_PORTAL", id: portal.id, changes: { open: !portal.open } });
        break;
      }
      case "REPLACE_SCENE": dispatch({ type: "REPLACE_SCENE", scene: action.scene }); break;
      case "LOAD_PRESET":
      case "SET_MODE":
      case "SET_AUDIO_STATUS":
        break;
    }
  }

  return (
    <section className="workspace-viewport-panel" data-testid="classic-workspace-viewport">
      <header className="viewport-tools">
        <span>{scene.name}</span>
        <span>{acoustic.fallbackNotice ? "Fallback" : "Worker"}</span>
      </header>
      <SceneEditor acousticFrame={acoustic.frame} dispatch={adapt} scene={scene} selection={selection} />
    </section>
  );
}
