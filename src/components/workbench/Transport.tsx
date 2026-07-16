import { PRESETS, type PresetId } from "@/domain/presets";
import type { AudioStatus, PreviewMode } from "@/domain/editor/state";

type TransportProps = Readonly<{
  activePresetId: PresetId;
  audioStatus: AudioStatus;
  mode: PreviewMode;
  wallCount: number;
  onAddWall: () => void;
  onAudioStatusChange: (status: AudioStatus) => void;
  onModeChange: (mode: PreviewMode) => void;
  onPresetChange: (presetId: PresetId) => void;
}>;

export function Transport({
  activePresetId,
  audioStatus,
  mode,
  wallCount,
  onAddWall,
  onAudioStatusChange,
  onModeChange,
  onPresetChange,
}: TransportProps) {
  return (
    <aside className="instrument-panel transport-panel" aria-label="Scene controls">
      <div className="panel-title-block">
        <p className="panel-kicker">Scene input</p>
        <h2>Workbench</h2>
      </div>

      <label className="field-label" htmlFor="preset-select">
        Scene preset
      </label>
      <select
        id="preset-select"
        value={activePresetId}
        onChange={(event) => onPresetChange(event.target.value as PresetId)}
      >
        {(Object.keys(PRESETS) as PresetId[]).map((presetId) => (
          <option key={presetId} value={presetId}>
            {PRESETS[presetId].name}
          </option>
        ))}
      </select>

      <button
        aria-describedby="wall-limit-status"
        className="primary-action"
        disabled={wallCount >= 100}
        type="button"
        onClick={onAddWall}
      >
        <span aria-hidden="true">＋</span>
        Add wall
      </button>
      <p className="control-note" id="wall-limit-status" aria-live="polite">
        {wallCount >= 100
          ? "Wall limit reached. Delete a wall before adding another."
          : `${100 - wallCount} wall slots available.`}
      </p>

      <div className="control-section">
        <p className="field-label">Preview mode</p>
        <div className="segmented-control" aria-label="Preview mode">
          {(["raw", "simulated"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => onModeChange(value)}
            >
              {value === "raw" ? "Raw" : "Simulated"}
            </button>
          ))}
        </div>
        <p className="control-note">
          {mode === "raw"
            ? "Unprocessed source bus selected."
            : "Simulation control path selected."}
        </p>
      </div>

      <div className="audio-control">
        <button
          className="audio-button"
          type="button"
          onClick={() =>
            onAudioStatusChange(audioStatus === "idle" ? "ready" : "idle")
          }
        >
          <span className="button-status-dot" aria-hidden="true" />
          {audioStatus === "idle" ? "Start Audio" : "Stop Audio"}
        </button>
        <p aria-live="polite">
          {audioStatus === "idle"
            ? "Audio awaits an explicit gesture."
            : "Control shell ready"}
        </p>
      </div>

      <div className="scope-note">
        <span>Gate A / editor</span>
        <p>Audio controls are state-only until the direct-path engine connects.</p>
      </div>
    </aside>
  );
}
