import type { WorkspaceMode } from "@/domain/workspace/types";

export type WorkspaceAcousticStatus = Readonly<{
  listenerName: string;
  route: "direct" | "portal" | "blocked" | "none";
  gainDb: number | null;
  rt60MidS: number | null;
  worker: "Worker" | "Fallback" | "Stopped";
  computeMs: number | null;
  workerCount: number | null;
  sourceComputeMsMax: number | null;
  sourceComputeMsTotal: number | null;
}>;

export function formatAcousticPoolMetrics(metrics: Readonly<{
  workerCount?: number | null;
  sourceComputeMsMax?: number | null;
  sourceComputeMsTotal?: number | null;
}>): string {
  if (
    metrics.workerCount === null || metrics.workerCount === undefined
    || metrics.sourceComputeMsMax === null || metrics.sourceComputeMsMax === undefined
    || metrics.sourceComputeMsTotal === null || metrics.sourceComputeMsTotal === undefined
  ) return "Pool metrics unavailable";
  return `${metrics.workerCount} worker${metrics.workerCount === 1 ? "" : "s"} · shard max ${metrics.sourceComputeMsMax.toFixed(2)} ms · shard total ${metrics.sourceComputeMsTotal.toFixed(2)} ms`;
}

export function WorkspaceStatusBar({ mode, revision, persistence, acoustic }: Readonly<{
  mode: WorkspaceMode;
  revision: number;
  persistence: string;
  acoustic: WorkspaceAcousticStatus | null;
}>) {
  return (
    <footer aria-live="polite" className="workspace-statusbar" data-worker-compute-ms={acoustic?.computeMs ?? ""} data-worker-count={acoustic?.workerCount ?? ""}>
      <span><i /> {acoustic?.worker === "Stopped" ? "Stopped" : "Ready"}</span>
      <span>Listener {acoustic?.listenerName ?? "—"}</span>
      <span>Route {acoustic?.route ?? "none"}</span>
      <span>Gain {acoustic?.gainDb === null || acoustic?.gainDb === undefined ? "—" : `${acoustic.gainDb.toFixed(1)} dB`}</span>
      <span>RT60 {acoustic?.rt60MidS === null || acoustic?.rt60MidS === undefined ? "—" : `${acoustic.rt60MidS.toFixed(2)} s`}</span>
      <span>{acoustic?.worker ?? "Stopped"}</span>
      <details><summary>Debug</summary><span>{mode === "hybrid-3d" ? "Hybrid 3D" : "Classic 2.5D"} · Rev {revision} · Local {persistence} · {acoustic?.computeMs === null || acoustic?.computeMs === undefined ? "No timing" : `${acoustic.computeMs.toFixed(2)} ms`} · {formatAcousticPoolMetrics(acoustic ?? {})} · Interactive acoustic approximation</span></details>
    </footer>
  );
}
