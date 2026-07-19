import type { WorkspaceMode } from "@/domain/workspace/types";

export type WorkspaceAcousticStatus = Readonly<{
  listenerName: string;
  route: "direct" | "portal" | "blocked" | "none";
  gainDb: number | null;
  rt60MidS: number | null;
  worker: "Worker" | "Fallback" | "Stopped";
  computeMs: number | null;
}>;

export function WorkspaceStatusBar({ mode, revision, persistence, acoustic }: Readonly<{
  mode: WorkspaceMode;
  revision: number;
  persistence: string;
  acoustic: WorkspaceAcousticStatus | null;
}>) {
  return (
    <footer aria-live="polite" className="workspace-statusbar" data-worker-compute-ms={acoustic?.computeMs ?? ""}>
      <span><i /> {acoustic?.worker === "Stopped" ? "Stopped" : "Ready"}</span>
      <span>Listener {acoustic?.listenerName ?? "—"}</span>
      <span>Route {acoustic?.route ?? "none"}</span>
      <span>Gain {acoustic?.gainDb === null || acoustic?.gainDb === undefined ? "—" : `${acoustic.gainDb.toFixed(1)} dB`}</span>
      <span>RT60 {acoustic?.rt60MidS === null || acoustic?.rt60MidS === undefined ? "—" : `${acoustic.rt60MidS.toFixed(2)} s`}</span>
      <span>{acoustic?.worker ?? "Stopped"}</span>
      <details><summary>Debug</summary><span>{mode === "hybrid-3d" ? "Hybrid 3D" : "Classic 2.5D"} · Rev {revision} · Local {persistence} · {acoustic?.computeMs === null || acoustic?.computeMs === undefined ? "No timing" : `${acoustic.computeMs.toFixed(2)} ms`} · Interactive acoustic approximation</span></details>
    </footer>
  );
}
