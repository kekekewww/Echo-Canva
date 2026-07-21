"use client";

import { useState } from "react";

import type { AcousticExplanation } from "@/ai/contracts";
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

export type AcousticExplanationState = Readonly<{
  status: "idle" | "loading" | "success" | "error";
  explanation: AcousticExplanation | null;
  error: string | null;
  revision: number | null;
  sourceId: string | null;
  requestNonce: number | null;
}>;

type AiScenePanelProps = Readonly<{
  currentScene: SceneSpec;
  compiler: SceneCompilerState;
  explanation: AcousticExplanationState;
  selectedSourceId: string | null;
  selectedSourceName: string | null;
  canExplain: boolean;
  onGenerate(prompt: string): Promise<void>;
  onApplyScene(scene: SceneSpec): void;
  onExplain(): Promise<void>;
}>;

export function AiScenePanel({
  currentScene,
  compiler,
  explanation,
  selectedSourceId,
  selectedSourceName,
  canExplain,
  onGenerate,
  onApplyScene,
  onExplain,
}: AiScenePanelProps) {
  const [prompt, setPrompt] = useState("");
  const candidate = compiler.candidate;
  const visibleExplanation =
    explanation.status === "success" &&
    explanation.revision === currentScene.revision &&
    explanation.sourceId === selectedSourceId
      ? explanation.explanation
      : null;
  const explanationMatchesSelection =
    explanation.revision === currentScene.revision && explanation.sourceId === selectedSourceId;
  const explanationLoading = explanation.status === "loading" && explanationMatchesSelection;
  const visibleError = explanation.status === "error" && explanationMatchesSelection ? explanation.error : null;

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

      <section className="acoustic-explanation" aria-labelledby="acoustic-explanation-title">
        <div className="panel-title-block">
          <p className="panel-kicker">Deterministic snapshot</p>
          <h3 id="acoustic-explanation-title">Acoustic explanation</h3>
        </div>
        <p className="control-note">
          Explains projected engine values only; it does not listen to audio or claim physical accuracy.
        </p>
        <p className="control-note">
          {selectedSourceName
            ? `Selected source: ${selectedSourceName}.`
            : "Select a source before requesting an explanation."}
        </p>
        <button
          className="primary-action"
          disabled={!canExplain || explanationLoading}
          onClick={() => void onExplain()}
          type="button"
        >
          {explanationLoading ? "Explaining…" : "Explain selected acoustics"}
        </button>
        {!canExplain ? (
          <p className="compiler-meta">Wait for the matching deterministic acoustic frame before explaining.</p>
        ) : null}
        {visibleExplanation ? (
          <div className="explanation-result" aria-live="polite">
            <p>{visibleExplanation.summary}</p>
            <dl data-testid="explanation-evidence">
              {visibleExplanation.factors.map((factor) => (
                <div key={`${factor.label}-${factor.evidence}`}>
                  <dt>{factor.label}</dt>
                  <dd>{factor.evidence}</dd>
                </div>
              ))}
            </dl>
            <ul>
              {visibleExplanation.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {visibleError ? (
          <p className="compiler-error" role="status">
            {visibleError} Your current scene is unchanged; continue in manual mode or load a preset.
          </p>
        ) : null}
      </section>
    </section>
  );
}
