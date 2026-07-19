import type { PreviewMode } from "@/domain/editor/state";
import type { WorkspaceMode } from "@/domain/workspace/types";

type Props = Readonly<{
  mode: WorkspaceMode;
  canUndo: boolean;
  canRedo: boolean;
  playing: boolean;
  previewMode: PreviewMode;
  onModeChange: (mode: WorkspaceMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onAdd: () => void;
  onTogglePlaying: () => void;
  onTogglePreviewMode: () => void;
  onOpenSettings: () => void;
  onShowOutliner: () => void;
  onShowInspector: () => void;
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
        <button className="mobile-panel-toggle" onClick={props.onShowOutliner} type="button">Scene</button>
        <button className="mobile-panel-toggle" onClick={props.onShowInspector} type="button">Inspector</button>
        <button data-testid="add-object" onClick={props.onAdd} type="button">＋ Add</button>
        <button aria-pressed={props.playing} onClick={props.onTogglePlaying} type="button">{props.playing ? "Stop" : "Play"}</button>
        <button onClick={props.onTogglePreviewMode} type="button">{props.previewMode === "simulated" ? "Raw" : "Simulated"}</button>
        <button aria-label="Undo" disabled={!props.canUndo} onClick={props.onUndo} type="button" title="Undo (Ctrl+Z)">↶</button>
        <button aria-label="Redo" disabled={!props.canRedo} onClick={props.onRedo} type="button" title="Redo (Ctrl+Shift+Z)">↷</button>
        <button className="danger-quiet" onClick={props.onReset} type="button">Reset</button>
        <button aria-label="Settings" onClick={props.onOpenSettings} type="button">⚙</button>
      </div>
    </header>
  );
}
