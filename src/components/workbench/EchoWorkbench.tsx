"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { Inspector } from "@/components/workbench/Inspector";
import {
  AiScenePanel,
  type AcousticExplanationState,
  type SceneCompilerState,
} from "@/components/workbench/AiScenePanel";
import { ReadoutStrip } from "@/components/workbench/ReadoutStrip";
import { SceneEditor } from "@/components/workbench/SceneEditor";
import { Transport } from "@/components/workbench/Transport";
import { editorReducer, type EditorAction } from "@/domain/editor/reducer";
import { createEditorState } from "@/domain/editor/state";
import { DEFAULT_PRESET_ID, PRESETS, type PresetId } from "@/domain/presets";
import { APP_NAME } from "@/domain/app-meta";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useAcousticFrame } from "@/hooks/useAcousticFrame";
import { installGateCAudioRenderValidation } from "@/audio/gate-c-render-validation";
import { requestAcousticExplanation, requestSceneCompilation } from "@/ai/client";

const INITIAL_COMPILER_STATE: SceneCompilerState = {
  status: "idle",
  candidate: null,
  error: null,
  model: null,
  repairAttempted: false,
  warnings: [],
};

const INITIAL_EXPLANATION_STATE: AcousticExplanationState = {
  status: "idle",
  explanation: null,
  error: null,
  revision: null,
  sourceId: null,
  requestNonce: null,
};

export function EchoWorkbench() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    createEditorState(PRESETS[DEFAULT_PRESET_ID]),
  );
  const [activePresetId, setActivePresetId] = useState<PresetId>(DEFAULT_PRESET_ID);
  const [compiler, setCompiler] = useState<SceneCompilerState>(INITIAL_COMPILER_STATE);
  const [explanation, setExplanation] = useState<AcousticExplanationState>(INITIAL_EXPLANATION_STATE);
  const explanationRequestNonce = useRef(0);
  const acoustic = useAcousticFrame(state.scene);
  const audio = useAudioEngine(
    state.scene,
    state.mode,
    acoustic.frame,
    acoustic.fallbackNotice,
  );

  useEffect(() => installGateCAudioRenderValidation(), []);

  async function toggleAudio(): Promise<void> {
    if (state.audioStatus === "idle") {
      dispatch({ type: "SET_AUDIO_STATUS", status: "ready" });
      try {
        await audio.startAudio();
      } catch {
        dispatch({ type: "SET_AUDIO_STATUS", status: "idle" });
      }
      return;
    }
    await audio.stopAudio();
    dispatch({ type: "SET_AUDIO_STATUS", status: "idle" });
  }

  function loadPreset(presetId: PresetId): void {
    setActivePresetId(presetId);
    dispatchEditorAction({ type: "LOAD_PRESET", presetId });
  }

  function invalidateAcousticExplanation(): void {
    explanationRequestNonce.current += 1;
    setExplanation(INITIAL_EXPLANATION_STATE);
  }

  function dispatchEditorAction(action: EditorAction): void {
    if (action.type !== "SET_AUDIO_STATUS" && action.type !== "SET_MODE") {
      invalidateAcousticExplanation();
    }
    dispatch(action);
  }

  function addWall(): void {
    const id = `user_wall_${state.scene.revision + 1}`;
    const xs = state.scene.room.outerPolygon.map(({ x }) => x);
    const ys = state.scene.room.outerPolygon.map(({ y }) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const x = minX + (maxX - minX) * 0.36;
    const a = { x, y: minY + (maxY - minY) * 0.35 };
    const b = { x, y: minY + (maxY - minY) * 0.65 };

    dispatchEditorAction({
      type: "ADD_WALL",
      wall: {
        id,
        a,
        b,
        thicknessM: 0.12,
        materialId: "concrete_hard",
        kind: "partition",
      },
    });
  }

  async function generateScene(prompt: string): Promise<void> {
    setCompiler((current) => ({ ...current, status: "loading", error: null }));
    const result = await requestSceneCompilation(prompt, state.scene);
    if (!result.ok) {
      setCompiler((current) => ({ ...current, status: "error", error: result.error.message }));
      return;
    }

    setCompiler({
      status: "success",
      candidate: result.scene,
      error: null,
      model: result.model,
      repairAttempted: result.repairAttempted,
      warnings: result.warnings,
    });
  }

  const selectedSourceId =
    state.selectedObject?.type === "source" ? state.selectedObject.id : undefined;
  const selectedSource = selectedSourceId
    ? state.scene.sources.find(({ id }) => id === selectedSourceId)
    : state.scene.sources[0];
  const selectedFrame =
    acoustic.frame?.revision === state.scene.revision && selectedSource
      ? acoustic.frame.sources.find(({ sourceId }) => sourceId === selectedSource.id)
      : undefined;
  const canExplain = Boolean(selectedSource && selectedFrame && acoustic.frame);

  async function explainSelectedAcoustics(): Promise<void> {
    if (!selectedSource || !selectedFrame || acoustic.frame?.revision !== state.scene.revision) {
      return;
    }

    const sourceId = selectedSource.id;
    const revision = state.scene.revision;
    const requestNonce = explanationRequestNonce.current + 1;
    explanationRequestNonce.current = requestNonce;
    setExplanation({
      ...INITIAL_EXPLANATION_STATE,
      status: "loading",
      revision,
      sourceId,
      requestNonce,
    });
    const result = await requestAcousticExplanation({
      sceneName: state.scene.name,
      sourceName: selectedSource.name,
      snapshot: {
        routeType: selectedFrame.routeType,
        effectiveDistanceM: selectedFrame.effectiveDistanceM,
        dryGainDb: selectedFrame.dryGainDb,
        lowpassHz: selectedFrame.lowpassHz,
        portalCount: selectedFrame.portalIds.length,
        rt60S: acoustic.frame.room.rt60S,
      },
    });
    if (requestNonce !== explanationRequestNonce.current) {
      return;
    }
    if (!result.ok) {
      setExplanation((current) =>
        current.requestNonce === requestNonce && current.revision === revision && current.sourceId === sourceId
          ? { ...current, status: "error", error: result.error.message }
          : current,
      );
      return;
    }
    setExplanation((current) =>
      current.requestNonce === requestNonce && current.revision === revision && current.sourceId === sourceId
        ? { ...current, status: "success", explanation: result.explanation, error: null }
        : current,
    );
  }

  return (
    <main className="app-shell" data-testid="app-shell" data-scene-revision={state.scene.revision}>
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-index">EC</span>
          <div>
            <p className="eyebrow">Spatial-audio field workstation</p>
            <h1>{APP_NAME}</h1>
          </div>
        </div>
        <div className="system-status">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>Editor online</strong>
            <span>Revision {state.scene.revision.toString().padStart(3, "0")}</span>
          </div>
        </div>
      </header>

      <section className="workstation" aria-label="Echo Canvas workbench">
        <Transport
          activePresetId={activePresetId}
          audioDiagnostics={audio.diagnostics}
          audioStatus={state.audioStatus}
          acousticFrame={acoustic.frame}
          acousticMetrics={acoustic.metrics}
          mode={state.mode}
          scene={state.scene}
          wallCount={state.scene.walls.length}
          onAddWall={addWall}
          onAudioStatusChange={() => void toggleAudio()}
          onModeChange={(mode) => dispatch({ type: "SET_MODE", mode })}
          onImportScene={(scene) => dispatchEditorAction({ type: "REPLACE_SCENE", scene })}
          onPresetChange={loadPreset}
        />

        <section className="canvas-panel" aria-labelledby="scene-name">
          <div className="canvas-heading">
            <div>
              <p className="panel-kicker">Plan / live edit</p>
              <h2 id="scene-name">{state.scene.name}</h2>
            </div>
            <p className="canvas-scale">Grid 1.0 m <span>·</span> {state.scene.walls.length} walls</p>
          </div>
          <SceneEditor
            scene={state.scene}
            selection={state.selectedObject}
            acousticFrame={acoustic.frame}
            dispatch={dispatchEditorAction}
          />
          <ReadoutStrip
            scene={state.scene}
            selection={state.selectedObject}
            audioDiagnostics={audio.diagnostics}
            acousticFrame={acoustic.frame}
            mode={state.mode}
          />
        </section>

        <Inspector
          scene={state.scene}
          selection={state.selectedObject}
          editNotice={state.editNotice}
          onDeleteWall={(wallId) => dispatchEditorAction({ type: "DELETE_WALL", wallId })}
          onMaterialChange={(wallId, materialId) =>
            dispatchEditorAction({ type: "SET_WALL_MATERIAL", wallId, materialId })
          }
          onTogglePortal={(portalId) => dispatchEditorAction({ type: "TOGGLE_PORTAL", portalId })}
        />

        <AiScenePanel
          compiler={compiler}
          currentScene={state.scene}
          explanation={explanation}
          selectedSourceId={selectedSource?.id ?? null}
          selectedSourceName={selectedSource?.name ?? null}
          canExplain={canExplain}
          onApplyScene={(scene) => {
            explanationRequestNonce.current += 1;
            setExplanation(INITIAL_EXPLANATION_STATE);
            dispatchEditorAction({ type: "REPLACE_SCENE", scene });
          }}
          onExplain={explainSelectedAcoustics}
          onGenerate={generateScene}
        />
      </section>
    </main>
  );
}
