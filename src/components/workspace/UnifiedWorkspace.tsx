"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AddObjectMenu } from "@/components/workspace/AddObjectMenu";
import { AudioAssetPicker } from "@/components/workspace/AudioAssetPicker";
import { ClassicViewportAdapter } from "@/components/workspace/ClassicViewportAdapter";
import { ContextInspector } from "@/components/workspace/ContextInspector";
import { HybridViewportAdapter } from "@/components/workspace/HybridViewportAdapter";
import { SceneOutliner } from "@/components/workspace/SceneOutliner";
import { WorkspaceStatusBar } from "@/components/workspace/WorkspaceStatusBar";
import { WorkspaceToolbar } from "@/components/workspace/WorkspaceToolbar";
import type { WorkspaceMode } from "@/domain/workspace/types";
import { useWorkspaceProjects } from "@/hooks/useWorkspaceProjects";
import { useLocalAudioLibrary } from "@/hooks/useLocalAudioLibrary";
import { installGateCAudioRenderValidation } from "@/audio/gate-c-render-validation";
import { AudioEngine } from "@/audio/AudioEngine";
import type { PreviewMode } from "@/domain/editor/state";
import { projectClassicScene } from "@/domain/workspace/projections";
import { useAudioEngine } from "@/hooks/useAudioEngine";

export function UnifiedWorkspace({ initialMode }: Readonly<{ initialMode?: WorkspaceMode }>) {
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const workspace = useWorkspaceProjects(initialMode);
  const audioLibrary = useLocalAudioLibrary();
  const [addOpen, setAddOpen] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("simulated");
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioEngine] = useState(() => new AudioEngine({ resolveAudioAsset: audioLibrary.resolveAudioAsset }));
  const activeScene = useMemo(() => projectClassicScene(workspace.activeProject), [workspace.activeProject]);
  const audio = useAudioEngine(
    activeScene,
    previewMode,
    null,
    null,
    audioLibrary.resolveAudioAsset,
    audioEngine,
    true,
  );

  useEffect(() => installGateCAudioRenderValidation(), []);

  useEffect(() => {
    function shortcuts(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) workspace.redo();
        else workspace.undo();
      }
    }
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [workspace]);

  function addObject(kind: "listener" | "source" | "wall" | "portal"): void {
    const project = workspace.activeProject;
    const suffix = `${project.revision + 1}`;
    if (kind === "listener") {
      workspace.dispatch({
        type: "ADD_LISTENER",
        listener: {
          id: `listener_${suffix}`,
          name: `Listener ${project.listeners.length + 1}`,
          position: { x: project.room3d.widthM / 2, y: 1.5, z: project.room3d.depthM / 2 },
          headingDeg: 0,
          enabled: true,
        },
      });
      return;
    }
    if (kind === "source") {
      setAudioPickerOpen(true);
      return;
    }
    if (kind === "wall") {
      workspace.dispatch({
        type: "ADD_WALL",
        wall: {
          id: `wall_${suffix}`,
          a: { x: project.room3d.widthM * 0.4, y: project.room3d.depthM * 0.3 },
          b: { x: project.room3d.widthM * 0.4, y: project.room3d.depthM * 0.7 },
          thicknessM: 0.15,
          materialId: "concrete_hard",
          kind: "partition",
        },
      });
      return;
    }
    const selectedWall = project.selection?.type === "wall"
      ? project.scene.walls.find(({ id }) => id === project.selection?.id)
      : project.scene.walls.find(({ kind: wallKind }) => wallKind === "partition");
    if (!selectedWall) return;
    workspace.dispatch({
      type: "ADD_PORTAL",
      portal: {
        id: `portal_${suffix}`,
        wallId: selectedWall.id,
        center: { x: (selectedWall.a.x + selectedWall.b.x) / 2, y: (selectedWall.a.y + selectedWall.b.y) / 2 },
        widthM: 1,
        heightM: 2.1,
        open: true,
        lossDb: 3,
      },
    });
  }

  function addSource(clipId: string, assetName: string): void {
    const project = workspace.activeProject;
    workspace.dispatch({
      type: "ADD_SOURCE",
      heightM: 1.5,
      source: {
        id: `source_${project.revision + 1}`,
        name: assetName.replace(/\.[^.]+$/, ""),
        clipId,
        sourceType: "point",
        position: { x: project.room3d.widthM * 0.7, y: project.room3d.depthM * 0.5 },
        gainDb: -6,
        loop: true,
      },
    });
    setAudioPickerOpen(false);
  }

  function reset(): void {
    if (window.confirm(`Reset only the ${workspace.activeMode === "hybrid-3d" ? "3D" : "2.5D"} project?`)) {
      workspace.resetActiveProject();
    }
  }

  async function togglePlaying(): Promise<void> {
    setAudioError(null);
    try {
      if (playing) await audio.stopAudio();
      else await audio.startAudio();
      setPlaying(!playing);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Audio is unavailable.");
    }
  }

  if (!hydrated) return <main className="unified-workspace workspace-loading" aria-label="Loading Echo Canvas" />;

  return (
    <main
      className="unified-workspace"
      data-audio-contexts={audio.diagnostics.contextCreations}
      data-audio-graphs={audio.diagnostics.graphCount}
      data-testid="unified-workspace"
      data-mode={workspace.activeMode}
    >
      <WorkspaceToolbar
        canRedo={workspace.canRedo}
        canUndo={workspace.canUndo}
        mode={workspace.activeMode}
        onAdd={() => setAddOpen(true)}
        onModeChange={workspace.setActiveMode}
        onRedo={workspace.redo}
        onReset={reset}
        onUndo={workspace.undo}
        onTogglePlaying={() => void togglePlaying()}
        onTogglePreviewMode={() => setPreviewMode((mode) => mode === "raw" ? "simulated" : "raw")}
        playing={playing}
        previewMode={previewMode}
      />
      {audioError ? <div className="workspace-error" role="alert">{audioError} <button onClick={() => void togglePlaying()} type="button">Retry</button></div> : null}
      {addOpen ? <AddObjectMenu onAdd={addObject} onClose={() => setAddOpen(false)} /> : null}
      {audioPickerOpen ? <AudioAssetPicker
        onChoose={addSource}
        onClose={() => setAudioPickerOpen(false)}
        onUpload={audioLibrary.add}
        records={audioLibrary.records}
        warning={audioLibrary.warning}
      /> : null}
      <div className="workspace-grid">
        <SceneOutliner project={workspace.activeProject} onSelect={(selection) => workspace.dispatch({ type: "SELECT_ENTITY", selection })} />
        {workspace.activeMode === "classic-2d5d"
          ? <ClassicViewportAdapter audioEngine={audioEngine} dispatch={workspace.dispatch} project={workspace.activeProject} />
          : <HybridViewportAdapter audioEngine={audioEngine} dispatch={workspace.dispatch} project={workspace.activeProject} />}
        <ContextInspector dispatch={workspace.dispatch} localAssets={audioLibrary.records.map((record) => ({
          id: record.id,
          name: record.name,
          mimeType: record.mimeType,
          size: record.size,
          createdAt: record.createdAt,
        }))} project={workspace.activeProject} />
      </div>
      <WorkspaceStatusBar mode={workspace.activeMode} persistence={workspace.persistenceStatus} revision={workspace.activeProject.revision} />
    </main>
  );
}
