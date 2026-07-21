"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AddObjectMenu } from "@/components/workspace/AddObjectMenu";
import { AudioAssetPicker } from "@/components/workspace/AudioAssetPicker";
import { ClassicViewportAdapter } from "@/components/workspace/ClassicViewportAdapter";
import { ContextInspector } from "@/components/workspace/ContextInspector";
import { HybridViewportAdapter } from "@/components/workspace/HybridViewportAdapter";
import { SceneOutliner } from "@/components/workspace/SceneOutliner";
import { WorkspaceStatusBar, type WorkspaceAcousticStatus } from "@/components/workspace/WorkspaceStatusBar";
import { WorkspaceToolbar } from "@/components/workspace/WorkspaceToolbar";
import { WorkspaceSettingsDialog } from "@/components/workspace/WorkspaceSettingsDialog";
import type { WorkspaceMode } from "@/domain/workspace/types";
import type { EntityRef } from "@/domain/workspace/types";
import type { PrimitiveKind } from "@/domain/workspace/types";
import { MAX_PRIMITIVES } from "@/domain/workspace/primitives";
import { useWorkspaceProjects } from "@/hooks/useWorkspaceProjects";
import { useLocalAudioLibrary } from "@/hooks/useLocalAudioLibrary";
import { installGateCAudioRenderValidation } from "@/audio/gate-c-render-validation";
import { AudioEngine } from "@/audio/AudioEngine";
import type { PreviewMode } from "@/domain/editor/state";
import { projectClassicScene } from "@/domain/workspace/projections";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import type { AiProvider } from "@/ai/contracts";

const AI_PROVIDER_STORAGE_KEY = "echo-canvas:ai-provider:v1";
const API_KEY_STORAGE_KEYS: Readonly<Record<AiProvider, string>> = {
  openai: "echo-canvas:openai-api-key:v1",
  openrouter: "echo-canvas:openrouter-api-key:v1",
};
const AI_ACCESS_CHANGE_EVENT = "echo-canvas:ai-access-change";
let memoryProvider: AiProvider = "openai";
const memoryApiKeys: Record<AiProvider, string> = { openai: "", openrouter: "" };

function readAiProvider(): AiProvider {
  if (typeof window === "undefined") return "openai";
  try {
    const stored = window.sessionStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    return stored === "openrouter" || stored === "openai" ? stored : memoryProvider;
  } catch {
    return memoryProvider;
  }
}

function readApiKey(provider: AiProvider): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(API_KEY_STORAGE_KEYS[provider]) ?? memoryApiKeys[provider];
  } catch {
    return memoryApiKeys[provider];
  }
}

function subscribeAiAccess(onChange: () => void): () => void {
  window.addEventListener(AI_ACCESS_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(AI_ACCESS_CHANGE_EVENT, onChange);
}

function notifyAiAccessChanged(): void {
  window.dispatchEvent(new Event(AI_ACCESS_CHANGE_EVENT));
}

function publishAiProvider(provider: AiProvider): void {
  memoryProvider = provider;
  try { window.sessionStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider); } catch { /* memory-only */ }
  notifyAiAccessChanged();
}

function publishApiKey(provider: AiProvider, nextApiKey: string): void {
  memoryApiKeys[provider] = nextApiKey;
  try {
    if (nextApiKey) window.sessionStorage.setItem(API_KEY_STORAGE_KEYS[provider], nextApiKey);
    else window.sessionStorage.removeItem(API_KEY_STORAGE_KEYS[provider]);
  } catch {
    // Some privacy modes disable sessionStorage; retain the key in memory for this page only.
  }
  notifyAiAccessChanged();
}

export function UnifiedWorkspace({ initialMode }: Readonly<{ initialMode?: WorkspaceMode }>) {
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const workspace = useWorkspaceProjects(initialMode);
  const dispatchWorkspace = workspace.dispatch;
  const audioLibrary = useLocalAudioLibrary();
  const [addOpen, setAddOpen] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [wallPlacement, setWallPlacement] = useState<Readonly<{
    mode: WorkspaceMode;
    first: Readonly<{ x: number; z: number }> | null;
  }> | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("simulated");
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const aiProvider = useSyncExternalStore<AiProvider>(subscribeAiAccess, readAiProvider, () => "openai");
  const apiKey = useSyncExternalStore(subscribeAiAccess, () => readApiKey(aiProvider), () => "");
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"outliner" | "inspector" | null>(null);
  const [acousticStatus, setAcousticStatus] = useState<WorkspaceAcousticStatus | null>(null);
  const reportAcousticStatus = useCallback((status: WorkspaceAcousticStatus) => setAcousticStatus(status), []);
  const [audioEngine] = useState(() => new AudioEngine({ resolveAudioAsset: audioLibrary.resolveAudioAsset }));
  const activeScene = useMemo(() => {
    const scene = projectClassicScene(workspace.activeProject);
    const missing = new Set(workspace.activeProject.missingAudioAssetIds);
    return { ...scene, sources: scene.sources.filter(({ clipId }) => !missing.has(clipId)) };
  }, [workspace.activeProject]);
  const audio = useAudioEngine(
    activeScene,
    previewMode,
    null,
    null,
    audioLibrary.resolveAudioAsset,
    audioEngine,
    true,
  );
  const selectOutlinerEntity = useCallback((selection: EntityRef) => {
    dispatchWorkspace({ type: "SELECT_ENTITY", selection });
    setMobilePanel(null);
  }, [dispatchWorkspace]);

  useEffect(() => installGateCAudioRenderValidation(), []);

  function saveApiKey(provider: AiProvider, nextApiKey: string): void {
    publishApiKey(provider, nextApiKey);
  }

  function forgetApiKey(provider: AiProvider): void {
    publishApiKey(provider, "");
  }

  function clearAiAccess(): void {
    publishApiKey("openai", "");
    publishApiKey("openrouter", "");
    publishAiProvider("openai");
  }

  useEffect(() => {
    function shortcuts(event: KeyboardEvent): void {
      if (event.key === "Escape" && addOpen) { setAddOpen(false); return; }
      if (event.key === "Escape" && audioPickerOpen) { setAudioPickerOpen(false); return; }
      if (event.key === "Escape" && (settingsOpen || confirmReset)) {
        setSettingsOpen(false);
        setConfirmClearAll(false);
        setConfirmReset(false);
        return;
      }
      if (event.key === "Escape" && wallPlacement) {
        setWallPlacement(null);
        return;
      }
      if (event.key === "Escape" && mobilePanel) {
        setMobilePanel(null);
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) workspace.redo();
        else workspace.undo();
      }
    }
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [addOpen, audioPickerOpen, confirmReset, mobilePanel, settingsOpen, wallPlacement, workspace]);

  function downloadRecoveryRecord(): void {
    if (!workspace.recoveryRaw) return;
    const blob = new Blob([workspace.recoveryRaw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `echo-canvas-${workspace.activeMode}-unread-cache.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function addObject(kind: "listener" | "source" | "wall" | "portal" | PrimitiveKind): void {
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
      setWallPlacement({ mode: project.mode, first: null });
      return;
    }
    if (kind === "box" || kind === "cylinder" || kind === "sphere") {
      const count = project.primitives.filter((primitive) => primitive.kind === kind).length + 1;
      const label = kind[0]!.toUpperCase() + kind.slice(1);
      workspace.dispatch({
        type: "ADD_PRIMITIVE",
        primitive: {
          id: `${kind}_${suffix}`,
          name: `${label} ${count}`,
          kind,
          position: {
            x: project.room3d.widthM / 2,
            y: Math.min(0.75, project.room3d.heightM / 2),
            z: project.room3d.depthM / 2,
          },
          dimensions: { x: 1.5, y: 1.5, z: 1.5 },
          rotationYDeg: 0,
          materialId: "wood_medium",
        },
      });
      return;
    }
    const selectedWall = project.selection?.type === "wall"
      ? project.scene.walls.find(({ id }) => id === project.selection?.id)
      : null;
    if (!selectedWall || project.disabledEntityIds.includes(selectedWall.id)) {
      workspace.dispatch({ type: "SET_NOTICE", notice: { code: "host_wall_required", message: "Select an enabled Wall before adding a Portal." } });
      return;
    }
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

  function placeWallPoint(point: Readonly<{ x: number; z: number }>): void {
    const placement = wallPlacement;
    if (!placement || placement.mode !== workspace.activeMode) return;
    if (!placement.first) {
      setWallPlacement({ ...placement, first: point });
      return;
    }
    if (Math.hypot(point.x - placement.first.x, point.z - placement.first.z) < 0.1) {
      workspace.dispatch({ type: "SET_NOTICE", notice: { code: "entity_missing", message: "Wall endpoints must be at least 0.1 m apart." } });
      return;
    }
    const project = workspace.activeProject;
    workspace.dispatch({
      type: "ADD_WALL",
      wall: {
        id: `wall_${project.revision + 1}`,
        a: { x: placement.first.x, y: placement.first.z },
        b: { x: point.x, y: point.z },
        thicknessM: 0.15,
        materialId: "concrete_hard",
        kind: "partition",
      },
    });
    setWallPlacement(null);
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
    const metadata = audioLibrary.records.find(({ id }) => id === clipId);
    if (metadata) workspace.dispatch({ type: "SET_LOCAL_AUDIO_METADATA", metadata: {
      id: metadata.id,
      name: metadata.name,
      mimeType: metadata.mimeType,
      size: metadata.size,
      createdAt: metadata.createdAt,
    } });
    setAudioPickerOpen(false);
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
      onPointerCancelCapture={(event) => {
        if ((event.target as Element).closest?.(".numeric-scrub-label")) workspace.endHistoryTransaction();
      }}
      onPointerDownCapture={(event) => {
        if ((event.target as Element).closest?.(".numeric-scrub-label")) workspace.beginHistoryTransaction();
      }}
      onPointerUpCapture={(event) => {
        if ((event.target as Element).closest?.(".numeric-scrub-label")) workspace.endHistoryTransaction();
      }}
    >
      <WorkspaceToolbar
        canRedo={workspace.canRedo}
        canUndo={workspace.canUndo}
        mode={workspace.activeMode}
        onAdd={() => setAddOpen(true)}
        onModeChange={workspace.setActiveMode}
        onRedo={workspace.redo}
        onReset={() => setConfirmReset(true)}
        onUndo={workspace.undo}
        onTogglePlaying={() => void togglePlaying()}
        onTogglePreviewMode={() => setPreviewMode((mode) => mode === "raw" ? "simulated" : "raw")}
        playing={playing}
        previewMode={previewMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onShowInspector={() => setMobilePanel("inspector")}
        onShowOutliner={() => setMobilePanel("outliner")}
      />
      {(workspace.persistenceStatus !== "saved" || audioLibrary.warning) ? <div className="workspace-persistence-warning" role="status"><strong>Memory-only warning</strong><span>{audioLibrary.warning ?? workspace.persistenceStatus}</span></div> : null}
      {workspace.recoveryRaw ? <div className="workspace-confirm-card workspace-recovery-card" role="status"><strong>Project cache recovery</strong><p>A safe preset is loaded. Download the unread record before replacing it.</p><button onClick={downloadRecoveryRecord} type="button">Download unread cache</button></div> : null}
      {confirmReset ? <div className="workspace-confirm-card workspace-floating-card" role="alertdialog" aria-label="Reset active project"><strong>Reset {workspace.activeMode === "hybrid-3d" ? "3D" : "2.5D"} project?</strong><p>The other mode and local audio stay unchanged.</p><button autoFocus onClick={() => { workspace.resetActiveProject(); setConfirmReset(false); }} type="button">Reset project</button><button onClick={() => setConfirmReset(false)} type="button">Cancel</button></div> : null}
      {settingsOpen ? <WorkspaceSettingsDialog
        apiKey={apiKey}
        provider={aiProvider}
        confirmClearAll={confirmClearAll}
        onCancelClearAll={() => setConfirmClearAll(false)}
        onClearAll={() => setConfirmClearAll(true)}
        onClose={() => { setConfirmClearAll(false); setSettingsOpen(false); }}
        onConfirmClearAll={() => void audioLibrary.clear().then(() => {
          workspace.clearAllProjects();
          clearAiAccess();
          setConfirmClearAll(false);
          setSettingsOpen(false);
        })}
        onForgetKey={forgetApiKey}
        onProviderChange={publishAiProvider}
        onSaveKey={saveApiKey}
      /> : null}
      {audioError ? <div className="workspace-error" role="alert">{audioError} <button onClick={() => void togglePlaying()} type="button">Retry</button></div> : null}
      {addOpen ? <AddObjectMenu
        availability={{
          listener: { enabled: workspace.activeProject.listeners.length < 8, reason: workspace.activeProject.listeners.length >= 8 ? "Limit: 8 listeners" : undefined },
          source: { enabled: workspace.activeProject.scene.sources.length < 4, reason: workspace.activeProject.scene.sources.length >= 4 ? "Limit: 4 sources" : undefined },
          wall: { enabled: workspace.activeProject.scene.walls.length < 100, reason: workspace.activeProject.scene.walls.length >= 100 ? "Limit: 100 walls" : undefined },
          box: { enabled: workspace.activeProject.primitives.length < MAX_PRIMITIVES, reason: workspace.activeProject.primitives.length >= MAX_PRIMITIVES ? `Limit: ${MAX_PRIMITIVES} shapes` : undefined },
          cylinder: { enabled: workspace.activeProject.primitives.length < MAX_PRIMITIVES, reason: workspace.activeProject.primitives.length >= MAX_PRIMITIVES ? `Limit: ${MAX_PRIMITIVES} shapes` : undefined },
          sphere: { enabled: workspace.activeProject.primitives.length < MAX_PRIMITIVES, reason: workspace.activeProject.primitives.length >= MAX_PRIMITIVES ? `Limit: ${MAX_PRIMITIVES} shapes` : undefined },
          portal: {
            enabled: workspace.activeProject.scene.portals.length < 8 && workspace.activeProject.selection?.type === "wall" && !workspace.activeProject.disabledEntityIds.includes(workspace.activeProject.selection.id),
            reason: workspace.activeProject.scene.portals.length >= 8
              ? "Limit: 8 Portals"
              : workspace.activeProject.selection?.type === "wall" && !workspace.activeProject.disabledEntityIds.includes(workspace.activeProject.selection.id)
                ? undefined
                : "Select an enabled Wall first",
          },
        }}
        onAdd={addObject}
        onClose={() => setAddOpen(false)}
      /> : null}
      {wallPlacement ? <div className="workspace-placement-card" role="status"><strong>Add Wall</strong><span>{wallPlacement.first ? "Choose endpoint B" : "Choose endpoint A"}</span><button onClick={() => setWallPlacement(null)} type="button">Cancel</button></div> : null}
      {audioPickerOpen ? <AudioAssetPicker
        onChoose={addSource}
        onClose={() => setAudioPickerOpen(false)}
        onUpload={audioLibrary.add}
        records={audioLibrary.records}
        warning={audioLibrary.warning}
      /> : null}
      <div className="workspace-grid">
        <SceneOutliner mobileOpen={mobilePanel === "outliner"} project={workspace.activeProject} onSelect={selectOutlinerEntity} />
        {workspace.activeMode === "classic-2d5d"
          ? <ClassicViewportAdapter
            audioEngine={audioEngine}
            dispatch={workspace.dispatch}
            onWallPlacementPoint={wallPlacement?.mode === "classic-2d5d" ? (point) => placeWallPoint({ x: point.x, z: point.y }) : undefined}
            onAcousticStatus={reportAcousticStatus}
            project={workspace.activeProject}
            wallPlacementFirst={wallPlacement?.mode === "classic-2d5d" && wallPlacement.first ? { x: wallPlacement.first.x, y: wallPlacement.first.z } : null}
          />
          : <HybridViewportAdapter
            audioEngine={audioEngine}
            dispatch={workspace.dispatch}
            onWallPlacementPoint={wallPlacement?.mode === "hybrid-3d" ? placeWallPoint : undefined}
            onAcousticStatus={reportAcousticStatus}
            project={workspace.activeProject}
            wallPlacementFirst={wallPlacement?.mode === "hybrid-3d" ? wallPlacement.first : null}
          />}
        <ContextInspector
          apiKey={apiKey}
          aiProvider={aiProvider}
          dispatch={workspace.dispatch}
          localAssets={Object.values({
            ...workspace.activeProject.localAudioMetadata,
            ...Object.fromEntries(audioLibrary.records.map((record) => [record.id, {
              id: record.id,
              name: record.name,
              mimeType: record.mimeType,
              size: record.size,
              createdAt: record.createdAt,
            }])),
          })}
          onRelinkAudio={async (clipId, file) => {
            const record = await audioLibrary.relink(clipId, file);
            workspace.dispatch({ type: "SET_LOCAL_AUDIO_METADATA", metadata: {
              id: record.id,
              name: record.name,
              mimeType: record.mimeType,
              size: record.size,
              createdAt: record.createdAt,
            } });
            workspace.dispatch({ type: "SET_AUDIO_ASSET_MISSING", clipId, missing: false });
            return record.id;
          }}
          onRemoveLocalAudio={async (clipId) => {
            await audioLibrary.remove(clipId);
            workspace.dispatch({ type: "SET_AUDIO_ASSET_MISSING", clipId, missing: true });
          }}
          mobileOpen={mobilePanel === "inspector"}
          project={workspace.activeProject}
        />
      </div>
      {mobilePanel ? <button aria-label="Close panel" className="workspace-drawer-backdrop" onClick={() => setMobilePanel(null)} type="button" /> : null}
      <WorkspaceStatusBar acoustic={acousticStatus} mode={workspace.activeMode} persistence={workspace.persistenceStatus} revision={workspace.activeProject.revision} />
    </main>
  );
}
