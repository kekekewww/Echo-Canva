import type { WorkspaceMode } from "@/domain/workspace/types";

type Props = Readonly<{
  mode: WorkspaceMode;
  canUndo: boolean;
  canRedo: boolean;
  onModeChange: (mode: WorkspaceMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onAdd: () => void;
}>;

export function WorkspaceToolbar(props: Props) {
  return (
    <header className="workspace-toolbar">
      <div className="workspace-brand"><strong>Echo Canvas</strong><span>Acoustic scene editor</span></div>
      <div className="workspace-mode-switch" aria-label="Editor mode">
        <button aria-pressed={props.mode === "classic-2d5d"} onClick={() => props.onModeChange("classic-2d5d")} type="button">2.5D</button>
        <button aria-pressed={props.mode === "hybrid-3d"} onClick={() => props.onModeChange("hybrid-3d")} type="button">3D</button>
      </div>
      <div className="workspace-toolbar-actions">
        <button data-testid="add-object" onClick={props.onAdd} type="button">＋ Add</button>
        <button disabled={!props.canUndo} onClick={props.onUndo} type="button" title="Undo (Ctrl+Z)">↶</button>
        <button disabled={!props.canRedo} onClick={props.onRedo} type="button" title="Redo (Ctrl+Shift+Z)">↷</button>
        <button className="danger-quiet" onClick={props.onReset} type="button">Reset</button>
      </div>
    </header>
  );
}
