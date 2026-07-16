import { MATERIALS } from "@/domain/materials/registry";
import type { EditorSelection } from "@/domain/editor/state";
import type { SceneSpec } from "@/domain/scene/types";

type InspectorProps = Readonly<{
  scene: SceneSpec;
  selection: EditorSelection;
  onDeleteWall: (wallId: string) => void;
  onMaterialChange: (wallId: string, materialId: string) => void;
  onTogglePortal: (portalId: string) => void;
}>;

function Measurement({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="measurement-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function Inspector({
  scene,
  selection,
  onDeleteWall,
  onMaterialChange,
  onTogglePortal,
}: InspectorProps) {
  const selectedWall =
    selection?.type === "wall"
      ? scene.walls.find(({ id }) => id === selection.id)
      : undefined;
  const selectedPortal =
    selection?.type === "portal"
      ? scene.portals.find(({ id }) => id === selection.id)
      : undefined;
  const selectedSource =
    selection?.type === "source"
      ? scene.sources.find(({ id }) => id === selection.id)
      : undefined;

  return (
    <aside className="instrument-panel inspector-panel" aria-label="Object inspector">
      <div className="panel-title-block">
        <p className="panel-kicker">Object inspector</p>
        <h2>
          {selectedWall
            ? "Wall settings"
            : selectedPortal
              ? "Portal settings"
              : selectedSource
                ? "Source settings"
                : selection?.type === "listener"
                  ? "Listener settings"
                  : "Nothing selected"}
        </h2>
      </div>

      {selectedWall ? (
        <div className="inspector-content">
          <p className="object-id">{selectedWall.id}</p>
          <label className="field-label" htmlFor="wall-material">
            Wall material
          </label>
          <select
            id="wall-material"
            value={selectedWall.materialId}
            onChange={(event) =>
              onMaterialChange(selectedWall.id, event.target.value)
            }
          >
            {MATERIALS.map((material) => (
              <option key={material.id} value={material.id}>
                {material.displayName}
              </option>
            ))}
          </select>
          <dl className="measurement-list">
            <Measurement label="Thickness" value={`${selectedWall.thicknessM.toFixed(2)} m`} />
            <Measurement label="Type" value={selectedWall.kind} />
          </dl>
          <p className="inspector-hint">Drag the cyan endpoint handles to reshape this wall.</p>
          <button
            type="button"
            className="danger-action"
            onClick={() => onDeleteWall(selectedWall.id)}
          >
            Delete selected wall
          </button>
        </div>
      ) : selectedPortal ? (
        <div className="inspector-content">
          <p className="object-id">{selectedPortal.id}</p>
          <button
            className="switch-row"
            type="button"
            role="switch"
            aria-label="Portal open"
            aria-checked={selectedPortal.open}
            onClick={() => onTogglePortal(selectedPortal.id)}
          >
            <span>Portal open</span>
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
          </button>
          <dl className="measurement-list">
            <Measurement label="Width" value={`${selectedPortal.widthM.toFixed(2)} m`} />
            <Measurement label="Loss" value={`${selectedPortal.lossDb.toFixed(1)} dB`} />
            <Measurement label="Host wall" value={selectedPortal.wallId} />
          </dl>
          <p className="inspector-hint">Portal-aware sound propagation connects in Gate B.</p>
        </div>
      ) : selectedSource ? (
        <div className="inspector-content">
          <p className="object-id">{selectedSource.id}</p>
          <dl className="measurement-list">
            <Measurement label="Clip" value={selectedSource.clipId} />
            <Measurement label="Gain" value={`${selectedSource.gainDb.toFixed(1)} dB`} />
            <Measurement
              label="Position"
              value={`${selectedSource.position.x.toFixed(2)}, ${selectedSource.position.y.toFixed(2)} m`}
            />
          </dl>
          <p className="inspector-hint">Drag the source across the plan to revise its position.</p>
        </div>
      ) : selection?.type === "listener" ? (
        <div className="inspector-content">
          <p className="object-id">LISTENER / PRIMARY</p>
          <dl className="measurement-list">
            <Measurement
              label="Position"
              value={`${scene.listener.position.x.toFixed(2)}, ${scene.listener.position.y.toFixed(2)} m`}
            />
            <Measurement label="Heading" value={`${scene.listener.headingDeg.toFixed(0)}°`} />
          </dl>
          <p className="inspector-hint">Drag the amber listener marker across the plan.</p>
        </div>
      ) : (
        <p className="empty-inspector">Select a wall, portal, source, or listener on the canvas.</p>
      )}
    </aside>
  );
}
