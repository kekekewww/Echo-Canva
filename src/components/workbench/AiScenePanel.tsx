"use client";

import { useState } from "react";

import type { SceneSpec } from "@/domain/scene/types";

export type SceneCompilerStatus = "idle" | "loading" | "success" | "error";

export type SceneCompilerState = Readonly<{
  status: SceneCompilerStatus;
  candidate: SceneSpec | null;
  error: string | null;
  model: string | null;
  repairAttempted: boolean;
  warnings: readonly string[];
}>;

type AiScenePanelProps = Readonly<{
  currentScene: SceneSpec;
  compiler: SceneCompilerState;
  onGenerate(prompt: string): Promise<void>;
  onApplyScene(scene: SceneSpec): void;
  onExplain(): void;
}>;

export function AiScenePanel({
  currentScene,
  compiler,
  onGenerate,
  onApplyScene,
  onExplain,
}: AiScenePanelProps) {
  const [prompt, setPrompt] = useState("");
  const candidate = compiler.status === "success" ? compiler.candidate : null;

  return (
    <section
      className="ai-scene-panel"
      aria-labelledby="ai-scene-title"
      data-current-scene-revision={currentScene.revision}
      data-explanation-handler={Boolean(onExplain)}
    >
      <div className="panel-title-block">
        <p className="panel-kicker">GPT-5.6 control plane</p>
        <h2 id="ai-scene-title">Generate a scene</h2>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onGenerate(prompt);
        }}
      >
        <label className="field-label" htmlFor="scene-prompt">
          Describe a scene
        </label>
        <textarea
          id="scene-prompt"
          maxLength={2000}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="A narrow treated room with one voice source."
          value={prompt}
        />
        <button
          className="primary-action"
          disabled={compiler.status === "loading" || prompt.trim().length === 0}
          type="submit"
        >
          {compiler.status === "loading" ? "Generating…" : "Generate scene"}
        </button>
      </form>

      {candidate ? (
        <div className="scene-candidate" aria-live="polite">
          <p className="candidate-name">Candidate: {candidate.name}</p>
          <p className="control-note">Review this validated candidate, then apply it to keep editing.</p>
          <button className="primary-action" onClick={() => onApplyScene(candidate)} type="button">
            Apply generated scene
          </button>
          {compiler.model ? <p className="compiler-meta">Model: {compiler.model}</p> : null}
          {compiler.repairAttempted ? <p className="compiler-meta">One validation repair was used.</p> : null}
          {compiler.warnings.map((warning) => (
            <p className="compiler-meta" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      {compiler.status === "error" && compiler.error ? (
        <p className="compiler-error" role="status">
          {compiler.error} Your current scene is unchanged; continue in manual mode or load a preset.
        </p>
      ) : null}
    </section>
  );
}
