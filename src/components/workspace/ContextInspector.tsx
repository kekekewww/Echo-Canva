import { MATERIALS } from "@/domain/materials/registry";
import { NumericScrubField } from "@/components/workspace/NumericScrubField";
import { HintCard } from "@/components/workspace/HintCard";
import { WorkspaceProjectTools } from "@/components/workspace/WorkspaceProjectTools";
import type { ProjectAction, WorkspaceProject } from "@/domain/workspace/types";
import { constrainPortal3D, constrainWall3D, resizeRoomAndClamp } from "@/domain/workspace/geometry-constraints";
import type { LocalAudioMetadata } from "@/domain/workspace/transfer";

export function ContextInspector({ project, dispatch, localAssets = [] }: Readonly<{
  project: WorkspaceProject;
  dispatch: (action: ProjectAction) => void;
  localAssets?: readonly LocalAudioMetadata[];
}>) {
  const selection = project.selection;
  const listener = selection?.type === "listener" ? project.listeners.find(({ id }) => id === selection.id) : null;
  const source = selection?.type === "source" ? project.scene.sources.find(({ id }) => id === selection.id) : null;
  const wall = selection?.type === "wall" ? project.scene.walls.find(({ id }) => id === selection.id) : null;
  const portal = selection?.type === "portal" ? project.scene.portals.find(({ id }) => id === selection.id) : null;
  const disabled = selection ? project.disabledEntityIds.includes(selection.id) : false;
  const wallVertical = wall ? project.wall3dById[wall.id] ?? { bottomM: 0, topM: project.room3d.heightM, thicknessM: wall.thicknessM } : null;
  const portalVertical = portal ? project.portal3dById[portal.id] ?? { bottomM: 0, topM: portal.heightM, thicknessM: 0.12 } : null;
  const position = listener?.position ?? (source ? {
    x: source.position.x,
    y: project.sourceHeightsM[source.id] ?? 1.5,
    z: source.position.y,
  } : null);

  function updatePosition(axis: "x" | "y" | "z", value: number): void {
    if (!position) return;
    const next = { ...position, [axis]: value };
    if (listener) dispatch({ type: "UPDATE_LISTENER", id: listener.id, changes: { position: next } });
    if (source) dispatch({ type: "MOVE_SOURCE", id: source.id, position: next });
  }

  function applyConstraint(result: ReturnType<typeof resizeRoomAndClamp>): void {
    if (result.ok) dispatch({ type: "REPLACE_PROJECT", project: result.project });
  }

  return (
    <aside className="workspace-inspector" aria-label="Inspector">
      <header><span>Inspector</span><small>{selection ? selection.type : "No selection"}</small></header>
      <WorkspaceProjectTools dispatch={dispatch} localAssets={localAssets} project={project} />
      {position ? (
        <section className="inspector-section">
          <h3>Transform</h3>
          <NumericScrubField axis="x" fineStep={0.01} label="X position" max={project.room3d.widthM} min={0} onCommit={(value) => updatePosition("x", value)} step={0.1} unit="m" value={position.x} />
          {project.mode === "hybrid-3d" ? <NumericScrubField axis="y" fineStep={0.01} label="Y position" max={project.room3d.heightM} min={0.1} onCommit={(value) => updatePosition("y", value)} step={0.1} unit="m" value={position.y} /> : null}
          <NumericScrubField axis="z" fineStep={0.01} label="Z position" max={project.room3d.depthM} min={0} onCommit={(value) => updatePosition("z", value)} step={0.1} unit="m" value={position.z} />
          {listener ? <NumericScrubField fineStep={0.1} label="Heading" max={360} min={-360} onCommit={(headingDeg) => dispatch({ type: "UPDATE_LISTENER", id: listener.id, changes: { headingDeg } })} step={1} unit="°" value={listener.headingDeg} /> : null}
        </section>
      ) : null}
      {wall ? (
        <section className="inspector-section">
          <h3>Wall</h3>
          <label className="select-field">Material<select onChange={(event) => dispatch({ type: "UPDATE_WALL", id: wall.id, changes: { materialId: event.target.value } })} value={wall.materialId}>{Object.values(MATERIALS).map((material) => <option key={material.id} value={material.id}>{material.displayName}</option>)}</select></label>
          <NumericScrubField fineStep={0.01} label="Thickness" max={2} min={0.05} onCommit={(thicknessM) => wallVertical && applyConstraint(constrainWall3D(project, wall.id, { a: wall.a, b: wall.b, ...wallVertical, thicknessM }))} step={0.05} unit="m" value={wall.thicknessM} />
          {project.mode === "hybrid-3d" && wallVertical ? <>
            <NumericScrubField fineStep={0.01} label="Bottom" max={project.room3d.heightM - 0.1} min={0} onCommit={(bottomM) => applyConstraint(constrainWall3D(project, wall.id, { a: wall.a, b: wall.b, ...wallVertical, bottomM }))} step={0.1} unit="m" value={wallVertical.bottomM} />
            <NumericScrubField fineStep={0.01} label="Top" max={project.room3d.heightM} min={0.1} onCommit={(topM) => applyConstraint(constrainWall3D(project, wall.id, { a: wall.a, b: wall.b, ...wallVertical, topM }))} step={0.1} unit="m" value={wallVertical.topM} />
          </> : null}
        </section>
      ) : null}
      {portal ? (
        <section className="inspector-section">
          <h3>Portal</h3>
          <button onClick={() => dispatch({ type: "UPDATE_PORTAL", id: portal.id, changes: { open: !portal.open } })} type="button">{portal.open ? "Close" : "Open"} Portal</button>
          <NumericScrubField fineStep={0.01} label="Width" max={8} min={0.4} onCommit={(widthM) => portalVertical && applyConstraint(constrainPortal3D(project, portal.id, { center: portal.center, widthM, ...portalVertical }))} step={0.1} unit="m" value={portal.widthM} />
          {portalVertical ? <>
            <NumericScrubField fineStep={0.01} label="Bottom" max={project.room3d.heightM - 0.4} min={0} onCommit={(bottomM) => applyConstraint(constrainPortal3D(project, portal.id, { center: portal.center, widthM: portal.widthM, ...portalVertical, bottomM }))} step={0.1} unit="m" value={portalVertical.bottomM} />
            <NumericScrubField fineStep={0.01} label="Top" max={project.room3d.heightM} min={0.4} onCommit={(topM) => applyConstraint(constrainPortal3D(project, portal.id, { center: portal.center, widthM: portal.widthM, ...portalVertical, topM }))} step={0.1} unit="m" value={portalVertical.topM} />
            <NumericScrubField fineStep={0.01} label="Thickness" max={2} min={0.02} onCommit={(thicknessM) => applyConstraint(constrainPortal3D(project, portal.id, { center: portal.center, widthM: portal.widthM, ...portalVertical, thicknessM }))} step={0.05} unit="m" value={portalVertical.thicknessM} />
          </> : null}
        </section>
      ) : null}
      {project.mode === "hybrid-3d" && selection?.type === "surface" ? (
        <section className="inspector-section">
          <h3>Room</h3>
          <NumericScrubField fineStep={0.01} label="Width" max={50} min={1} onCommit={(widthM) => applyConstraint(resizeRoomAndClamp(project, { ...project.room3d, widthM }))} step={0.1} unit="m" value={project.room3d.widthM} />
          <NumericScrubField fineStep={0.01} label="Depth" max={50} min={1} onCommit={(depthM) => applyConstraint(resizeRoomAndClamp(project, { ...project.room3d, depthM }))} step={0.1} unit="m" value={project.room3d.depthM} />
          <NumericScrubField fineStep={0.01} label="Height" max={12} min={2} onCommit={(heightM) => applyConstraint(resizeRoomAndClamp(project, { ...project.room3d, heightM }))} step={0.1} unit="m" value={project.room3d.heightM} />
        </section>
      ) : null}
      {selection ? (
        <section className="inspector-actions">
          {!(selection.type === "surface" && selection.id === "floor") ? <button onClick={() => dispatch({ type: "SET_ENTITY_ENABLED", entity: selection, enabled: disabled })} type="button">{disabled ? "Enable" : "Disable"}</button> : null}
          {selection.type === "listener" ? <button onClick={() => dispatch({ type: "DELETE_LISTENER", id: selection.id })} type="button">Delete</button> : null}
          {selection.type === "source" ? <button onClick={() => dispatch({ type: "DELETE_SOURCE", id: selection.id })} type="button">Delete</button> : null}
          {selection.type === "wall" ? <button onClick={() => dispatch({ type: "DELETE_WALL", id: selection.id })} type="button">Delete</button> : null}
          {selection.type === "portal" ? <button onClick={() => dispatch({ type: "DELETE_PORTAL", id: selection.id })} type="button">Delete</button> : null}
        </section>
      ) : <HintCard title="Select an object">Choose an item in the Outliner or viewport to edit exact values.</HintCard>}
      {project.notice ? <HintCard title="Edit notice"><p>{project.notice.message}</p></HintCard> : null}
    </aside>
  );
}
