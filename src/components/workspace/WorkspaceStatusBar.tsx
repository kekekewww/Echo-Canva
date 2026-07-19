import type { WorkspaceMode } from "@/domain/workspace/types";

export function WorkspaceStatusBar({ mode, revision, persistence }: Readonly<{
  mode: WorkspaceMode;
  revision: number;
  persistence: string;
}>) {
  return (
    <footer className="workspace-statusbar">
      <span><i /> Ready</span>
      <span>{mode === "hybrid-3d" ? "Hybrid 3D" : "Classic 2.5D"}</span>
      <span>Rev {revision}</span>
      <span>Local {persistence}</span>
      <span>Interactive acoustic approximation</span>
    </footer>
  );
}
