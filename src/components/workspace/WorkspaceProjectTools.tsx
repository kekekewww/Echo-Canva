"use client";

import { useState } from "react";

import { requestAcousticExplanation, requestSceneCompilation } from "@/ai/client";
import type { AcousticExplanation } from "@/ai/contracts";
import { computeAcousticFrame } from "@/acoustics/compute-frame";
import { HintCard } from "@/components/workspace/HintCard";
import { SceneTransfer } from "@/components/workbench/SceneTransfer";
import { PRESETS, type PresetId } from "@/domain/presets";
import type { SceneSpec } from "@/domain/scene/types";
import { projectClassicScene } from "@/domain/workspace/projections";
import type { ProjectAction, WorkspaceProject } from "@/domain/workspace/types";

export function WorkspaceProjectTools({ project, dispatch }: Readonly<{
  project: WorkspaceProject;
  dispatch: (action: ProjectAction) => void;
}>) {
  const [prompt, setPrompt] = useState("");
  const [candidate, setCandidate] = useState<SceneSpec | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<AcousticExplanation | null>(null);
  const scene = projectClassicScene(project);

  async function generate(): Promise<void> {
    setStatus("Generating…");
    const result = await requestSceneCompilation(prompt, scene);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setCandidate(result.scene);
    setStatus(`Validated by ${result.model}${result.repairAttempted ? " · repaired once" : ""}`);
  }

  async function explain(): Promise<void> {
    const source = project.selection?.type === "source"
      ? scene.sources.find(({ id }) => id === project.selection?.id)
      : scene.sources[0];
    if (!source) return;
    const frame = computeAcousticFrame(scene);
    const sourceFrame = frame.sources.find(({ sourceId }) => sourceId === source.id)!;
    setStatus("Explaining…");
    const result = await requestAcousticExplanation({
      sceneName: scene.name,
      sourceName: source.name,
      snapshot: {
        routeType: sourceFrame.routeType,
        effectiveDistanceM: sourceFrame.effectiveDistanceM,
        dryGainDb: sourceFrame.dryGainDb,
        lowpassHz: sourceFrame.lowpassHz,
        portalCount: sourceFrame.portalIds.length,
        rt60S: frame.room.rt60S,
      },
    });
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setExplanation(result.explanation);
    setStatus(`Explained by ${result.model}`);
  }

  return (
    <section className="workspace-project-tools">
      <label className="select-field">Preset
        <select aria-label="Scene preset" onChange={(event) => dispatch({ type: "REPLACE_SCENE", scene: structuredClone(PRESETS[event.target.value as PresetId]) })} value={Object.entries(PRESETS).find(([, preset]) => preset.name === project.scene.name)?.[0] ?? "concrete-partition"}>
          {Object.entries(PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.name}</option>)}
        </select>
      </label>
      <HintCard title="AI scene tools">
        <label>Scene description<textarea aria-label="Describe a scene" maxLength={2000} onChange={(event) => setPrompt(event.target.value)} value={prompt} /></label>
        <button disabled={!prompt.trim()} onClick={() => void generate()} type="button">Generate scene</button>
        {candidate ? <button onClick={() => { dispatch({ type: "REPLACE_SCENE", scene: candidate }); setCandidate(null); }} type="button">Apply {candidate.name}</button> : null}
        <button onClick={() => void explain()} type="button">Explain selected acoustics</button>
        {status ? <p role="status">{status}</p> : null}
        {explanation ? <div className="workspace-explanation"><strong>{explanation.summary}</strong>{explanation.factors.map((factor) => <p key={factor.label}>{factor.label}: {factor.evidence}</p>)}<small>{explanation.limitations.join(" ")}</small></div> : null}
      </HintCard>
      <HintCard title="Import / export">
        <SceneTransfer scene={scene} onImportScene={(imported) => dispatch({ type: "REPLACE_SCENE", scene: imported })} />
      </HintCard>
    </section>
  );
}
