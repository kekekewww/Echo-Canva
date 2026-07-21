"use client";

import { useState } from "react";

import { requestAcousticExplanation, requestSceneCompilation } from "@/ai/client";
import type { AcousticExplanation, CompileSceneSuccess } from "@/ai/contracts";
import { computeAcousticFrame } from "@/acoustics/compute-frame";
import { HintCard } from "@/components/workspace/HintCard";
import { PRESETS, type PresetId } from "@/domain/presets";
import { projectClassicScene, projectHybridDocument } from "@/domain/workspace/projections";
import type { ProjectAction, WorkspaceProject } from "@/domain/workspace/types";
import type { LocalAudioMetadata } from "@/domain/workspace/transfer";
import { parseWorkspaceProject, serializeWorkspaceProject } from "@/domain/workspace/transfer";

export function WorkspaceProjectTools({ project, dispatch, apiKey, localAssets = [] }: Readonly<{
  project: WorkspaceProject;
  dispatch: (action: ProjectAction) => void;
  apiKey: string;
  localAssets?: readonly LocalAudioMetadata[];
}>) {
  const [prompt, setPrompt] = useState("");
  const [candidate, setCandidate] = useState<CompileSceneSuccess | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<AcousticExplanation | null>(null);
  const scene = projectClassicScene(project);

  function exportAuthoring(): void {
    const metadata = new Map(Object.entries(project.localAudioMetadata));
    for (const asset of localAssets) metadata.set(asset.id, asset);
    const blob = new Blob([serializeWorkspaceProject(project, [...metadata.values()])], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.scene.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "echo-canvas"}.authoring.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importAuthoring(file: File): Promise<void> {
    try {
      const imported = parseWorkspaceProject(
        await file.text(),
        project.mode,
        new Set(localAssets.map(({ id }) => id)),
      );
      dispatch({ type: "REPLACE_PROJECT", project: imported.project });
      setStatus(imported.project.missingAudioAssetIds.length
        ? `Authoring project imported; ${imported.project.missingAudioAssetIds.length} audio asset requires relinking.`
        : "Authoring project imported.");
    } catch (error) {
      setStatus(`Import rejected: ${error instanceof Error ? error.message : "unsupported document"}`);
    }
  }

  async function generate(): Promise<void> {
    setStatus("Generating…");
    const baseScene = project.mode === "hybrid-3d" ? projectHybridDocument(project) : scene;
    const result = await requestSceneCompilation(prompt, baseScene, project.mode, fetch, apiKey);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setCandidate(result);
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
    }, fetch, apiKey);
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
        {candidate ? <button onClick={() => {
          dispatch({
            type: "REPLACE_SCENE",
            scene: candidate.scene,
            spatial3d: candidate.spatial3d,
            primitives: candidate.spatial3d?.primitives,
          });
          setCandidate(null);
        }} type="button">Apply {candidate.scene.name}</button> : null}
        <button onClick={() => void explain()} type="button">Explain selected acoustics</button>
        {explanation ? <div className="workspace-explanation"><strong>{explanation.summary}</strong>{explanation.factors.map((factor) => <p key={factor.label}>{factor.label}: {factor.evidence}</p>)}<small>{explanation.limitations.join(" ")}</small></div> : null}
      </HintCard>
      <HintCard title="Import / export">
        <button onClick={exportAuthoring} type="button">Export authoring JSON</button>
        <label className="file-button">Import authoring JSON
          <input accept="application/json,.json" aria-label="Import authoring JSON" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importAuthoring(file);
            event.currentTarget.value = "";
          }} type="file" />
        </label>
      </HintCard>
      {status ? <p className="workspace-project-status" role="status">{status}</p> : null}
    </section>
  );
}
