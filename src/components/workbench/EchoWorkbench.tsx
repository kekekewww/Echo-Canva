"use client";

import { useEffect, useReducer, useState } from "react";

import { Inspector } from "@/components/workbench/Inspector";
import { ReadoutStrip } from "@/components/workbench/ReadoutStrip";
import { SceneEditor } from "@/components/workbench/SceneEditor";
import { Transport } from "@/components/workbench/Transport";
import { editorReducer } from "@/domain/editor/reducer";
import { createEditorState } from "@/domain/editor/state";
import { DEFAULT_PRESET_ID, PRESETS, type PresetId } from "@/domain/presets";
import { APP_NAME } from "@/domain/app-meta";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useAcousticFrame } from "@/hooks/useAcousticFrame";
import { installGateCAudioRenderValidation } from "@/audio/gate-c-render-validation";

export function EchoWorkbench() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    createEditorState(PRESETS[DEFAULT_PRESET_ID]),
  );
  const [activePresetId, setActivePresetId] = useState<PresetId>(DEFAULT_PRESET_ID);
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
    dispatch({ type: "LOAD_PRESET", presetId });
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

    dispatch({
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
          wallCount={state.scene.walls.length}
          onAddWall={addWall}
          onAudioStatusChange={() => void toggleAudio()}
          onModeChange={(mode) => dispatch({ type: "SET_MODE", mode })}
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
            dispatch={dispatch}
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
          onDeleteWall={(wallId) => dispatch({ type: "DELETE_WALL", wallId })}
          onMaterialChange={(wallId, materialId) =>
            dispatch({ type: "SET_WALL_MATERIAL", wallId, materialId })
          }
          onTogglePortal={(portalId) => dispatch({ type: "TOGGLE_PORTAL", portalId })}
        />
      </section>
    </main>
  );
}
