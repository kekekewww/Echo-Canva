"use client";

import { useState } from "react";

import { MATERIALS } from "@/domain/materials/registry";
import { NumericScrubField } from "@/components/workspace/NumericScrubField";
import { HintCard } from "@/components/workspace/HintCard";
import { WorkspaceProjectTools } from "@/components/workspace/WorkspaceProjectTools";
import type { EntityRef, ProjectAction, WorkspaceProject } from "@/domain/workspace/types";
import { constrainPortal3D, constrainWall3D, resizeRoomAndClamp } from "@/domain/workspace/geometry-constraints";
import type { LocalAudioMetadata } from "@/domain/workspace/transfer";
import { AUDIO_ASSETS } from "@/domain/audio-assets/registry";

export function ContextInspector({ project, dispatch, localAssets = [], onRelinkAudio, onRemoveLocalAudio, mobileOpen = false }: Readonly<{
  project: WorkspaceProject;
  dispatch: (action: ProjectAction) => void;
  localAssets?: readonly LocalAudioMetadata[];
  onRelinkAudio?: (clipId: string, file: File) => Promise<string>;
  onRemoveLocalAudio?: (clipId: string) => Promise<void>;
  mobileOpen?: boolean;
}>) {
  const [confirmAudioRemoval, setConfirmAudioRemoval] = useState(false);
  const [audioEditStatus, setAudioEditStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EntityRef | null>(null);
  const selection = project.selection;
  const listener = selection?.type === "listener" ? project.listeners.find(({ id }) => id === selection.id) : null;
  const source = selection?.type === "source" ? project.scene.sources.find(({ id }) => id === selection.id) : null;
  const wall = selection?.type === "wall" ? project.scene.walls.find(({ id }) => id === selection.id) : null;
  const portal = selection?.type === "portal" ? project.scene.portals.find(({ id }) => id === selection.id) : null;
  const portalHostWall = portal ? project.scene.walls.find(({ id }) => id === portal.wallId) : null;
  const disabled = selection ? project.disabledEntityIds.includes(selection.id) : false;
  const wallVertical = wall ? project.wall3dById[wall.id] ?? { bottomM: 0, topM: project.room3d.heightM, thicknessM: wall.thicknessM } : null;
  const portalVertical = portal ? project.portal3dById[portal.id] ?? { bottomM: 0, topM: portal.heightM, thicknessM: 0.12 } : null;
  const position = listener?.position ?? (source ? {
    x: source.position.x,
    y: project.sourceHeightsM[source.id] ?? 1.5,
    z: source.position.y,
  } : null);
  const localAsset = source ? localAssets.find(({ id }) => id === source.clipId) : null;
  const builtInAsset = source ? AUDIO_ASSETS.find(({ id }) => id === source.clipId) : null;
  const sourceMissing = source ? project.missingAudioAssetIds.includes(source.clipId) : false;

  function updatePosition(axis: "x" | "y" | "z", value: number): void {
    if (!position) return;
    const next = { ...position, [axis]: value };
    if (listener) dispatch({ type: "UPDATE_LISTENER", id: listener.id, changes: { position: next } });
    if (source) dispatch({ type: "MOVE_SOURCE", id: source.id, position: next });
  }

  function applyConstraint(result: ReturnType<typeof resizeRoomAndClamp>): void {
    if (result.ok) dispatch({ type: "REPLACE_PROJECT", project: result.project });
    else dispatch({ type: "SET_NOTICE", notice: { code: "entity_missing", message: result.message } });
  }

  const portalHostLength = portalHostWall ? Math.hypot(portalHostWall.b.x - portalHostWall.a.x, portalHostWall.b.y - portalHostWall.a.y) : 0;
  const portalOffset = portal && portalHostWall
    ? ((portal.center.x - portalHostWall.a.x) * (portalHostWall.b.x - portalHostWall.a.x) + (portal.center.y - portalHostWall.a.y) * (portalHostWall.b.y - portalHostWall.a.y)) / Math.max(portalHostLength, 0.0001)
    : 0;

  function deleteConfirmed(entity: EntityRef): void {
    if (entity.type === "listener") dispatch({ type: "DELETE_LISTENER", id: entity.id });
    if (entity.type === "source") dispatch({ type: "DELETE_SOURCE", id: entity.id });
    if (entity.type === "wall") dispatch({ type: "DELETE_WALL", id: entity.id });
    if (entity.type === "portal") dispatch({ type: "DELETE_PORTAL", id: entity.id });
    setConfirmDelete(null);
  }

  return (
    <aside aria-label="Inspector" aria-modal={mobileOpen || undefined} className={`workspace-inspector${mobileOpen ? " is-mobile-open" : ""}`} role={mobileOpen ? "dialog" : undefined}>
      <header><span>Inspector</span><small>{selection ? selection.type : "No selection"}</small></header>
      <WorkspaceProjectTools dispatch={dispatch} localAssets={localAssets} project={project} />
      {position ? (
        <section className="inspector-section">
          <h3>Transform</h3>
          <NumericScrubField axis="x" fineStep={0.01} label="X position" max={project.room3d.widthM} min={0} onCommit={(value) => updatePosition("x", value)} step={0.1} unit="m" value={position.x} />
          {project.mode === "hybrid-3d" ? <NumericScrubField axis="y" fineStep={0.01} label="Y position" max={project.room3d.heightM} min={0.1} onCommit={(value) => updatePosition("y", value)} step={0.1} unit="m" value={position.y} /> : null}
          <NumericScrubField axis="z" fineStep={0.01} label="Z position" max={project.room3d.depthM} min={0} onCommit={(value) => updatePosition("z", value)} step={0.1} unit="m" value={position.z} />
          <button onClick={() => {
            const reset = { x: project.room3d.widthM / 2, y: Math.min(1.5, project.room3d.heightM), z: project.room3d.depthM / 2 };
            if (listener) dispatch({ type: "UPDATE_LISTENER", id: listener.id, changes: { position: reset } });
            if (source) dispatch({ type: "MOVE_SOURCE", id: source.id, position: reset });
          }} type="button">Reset position</button>
          {listener ? <NumericScrubField fineStep={0.1} label="Heading" max={360} min={-360} onCommit={(headingDeg) => dispatch({ type: "UPDATE_LISTENER", id: listener.id, changes: { headingDeg } })} step={1} unit="°" value={listener.headingDeg} /> : null}
        </section>
      ) : null}
      {source ? (
        <section className="inspector-section">
          <h3>Source</h3>
          <label className="text-field">Name
            <input
              aria-label="Source name"
              defaultValue={source.name}
              key={`${source.id}-${source.name}`}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim();
                if (name && name !== source.name) dispatch({ type: "UPDATE_SOURCE", id: source.id, changes: { name } });
                else event.currentTarget.value = source.name;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") { event.currentTarget.value = source.name; event.currentTarget.blur(); }
              }}
            />
          </label>
          <NumericScrubField fineStep={0.1} label="Source gain" max={12} min={-60} onCommit={(gainDb) => dispatch({ type: "UPDATE_SOURCE", id: source.id, changes: { gainDb } })} step={1} unit="dB" value={source.gainDb} />
          <label className="check-field"><input aria-label="Loop source" checked={source.loop} onChange={(event) => dispatch({ type: "UPDATE_SOURCE", id: source.id, changes: { loop: event.currentTarget.checked } })} type="checkbox" />Loop</label>
          <div className={`source-asset-state${sourceMissing ? " is-missing" : ""}`}>
            <span>Audio</span><strong>{localAsset?.name ?? builtInAsset?.label ?? source.clipId}</strong>
            {sourceMissing ? <em>Relink required</em> : null}
          </div>
          {(localAsset || sourceMissing) && onRelinkAudio ? <label className="file-button">Relink audio
            <input accept="audio/wav,audio/mpeg,audio/ogg" aria-label="Relink audio" onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              setAudioEditStatus("Relinking audio…");
              void onRelinkAudio(source.clipId, file)
                .then(() => setAudioEditStatus("Audio relinked."))
                .catch((error: unknown) => setAudioEditStatus(error instanceof Error ? error.message : "Relink failed."));
              event.currentTarget.value = "";
            }} type="file" />
          </label> : null}
          {localAsset && onRemoveLocalAudio ? (
            confirmAudioRemoval
              ? <div className="workspace-confirm-card" role="alert"><strong>Remove local audio?</strong><p>The Source stays in place and becomes silent until relinked.</p><button onClick={() => {
                setAudioEditStatus("Removing audio…");
                void onRemoveLocalAudio(source.clipId).then(() => {
                  setConfirmAudioRemoval(false);
                  setAudioEditStatus("Local audio removed.");
                });
              }} type="button">Remove audio</button><button onClick={() => setConfirmAudioRemoval(false)} type="button">Cancel</button></div>
              : <button onClick={() => setConfirmAudioRemoval(true)} type="button">Remove local audio</button>
          ) : null}
          {audioEditStatus ? <p role="status">{audioEditStatus}</p> : null}
        </section>
      ) : null}
      {wall ? (
        <section className="inspector-section">
          <h3>Wall</h3>
          {wallVertical ? <>
            <NumericScrubField axis="x" fineStep={0.01} label="Endpoint A X" max={project.room3d.widthM} min={0} onCommit={(x) => applyConstraint(constrainWall3D(project, wall.id, { a: { ...wall.a, x }, b: wall.b, ...wallVertical }))} step={0.1} unit="m" value={wall.a.x} />
            <NumericScrubField axis="z" fineStep={0.01} label="Endpoint A Z" max={project.room3d.depthM} min={0} onCommit={(z) => applyConstraint(constrainWall3D(project, wall.id, { a: { ...wall.a, y: z }, b: wall.b, ...wallVertical }))} step={0.1} unit="m" value={wall.a.y} />
            <NumericScrubField axis="x" fineStep={0.01} label="Endpoint B X" max={project.room3d.widthM} min={0} onCommit={(x) => applyConstraint(constrainWall3D(project, wall.id, { a: wall.a, b: { ...wall.b, x }, ...wallVertical }))} step={0.1} unit="m" value={wall.b.x} />
            <NumericScrubField axis="z" fineStep={0.01} label="Endpoint B Z" max={project.room3d.depthM} min={0} onCommit={(z) => applyConstraint(constrainWall3D(project, wall.id, { a: wall.a, b: { ...wall.b, y: z }, ...wallVertical }))} step={0.1} unit="m" value={wall.b.y} />
          </> : null}
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
          {portalHostWall && portalVertical ? <NumericScrubField fineStep={0.01} label="Offset on Wall" max={Math.max(portal.widthM / 2, portalHostLength - portal.widthM / 2)} min={portal.widthM / 2} onCommit={(offsetM) => {
            const ux = (portalHostWall.b.x - portalHostWall.a.x) / Math.max(portalHostLength, 0.0001);
            const uz = (portalHostWall.b.y - portalHostWall.a.y) / Math.max(portalHostLength, 0.0001);
            applyConstraint(constrainPortal3D(project, portal.id, {
              center: { x: portalHostWall.a.x + ux * offsetM, y: portalHostWall.a.y + uz * offsetM },
              widthM: portal.widthM,
              ...portalVertical,
            }));
          }} step={0.1} unit="m" value={portalOffset} /> : null}
          <NumericScrubField fineStep={0.01} label="Width" max={8} min={0.4} onCommit={(widthM) => portalVertical && applyConstraint(constrainPortal3D(project, portal.id, { center: portal.center, widthM, ...portalVertical }))} step={0.1} unit="m" value={portal.widthM} />
          {project.mode === "hybrid-3d" && portalVertical ? <>
            <NumericScrubField fineStep={0.01} label="Bottom" max={project.room3d.heightM - 0.4} min={0} onCommit={(bottomM) => applyConstraint(constrainPortal3D(project, portal.id, { center: portal.center, widthM: portal.widthM, ...portalVertical, bottomM }))} step={0.1} unit="m" value={portalVertical.bottomM} />
            <NumericScrubField fineStep={0.01} label="Top" max={project.room3d.heightM} min={0.4} onCommit={(topM) => applyConstraint(constrainPortal3D(project, portal.id, { center: portal.center, widthM: portal.widthM, ...portalVertical, topM }))} step={0.1} unit="m" value={portalVertical.topM} />
          </> : null}
          {portalVertical ? <NumericScrubField fineStep={0.01} label="Thickness" max={2} min={0.02} onCommit={(thicknessM) => applyConstraint(constrainPortal3D(project, portal.id, { center: portal.center, widthM: portal.widthM, ...portalVertical, thicknessM }))} step={0.05} unit="m" value={portalVertical.thicknessM} /> : null}
        </section>
      ) : null}
      {selection?.type === "surface" && selection.id === "room" ? (
        <section className="inspector-section">
          <h3>Room</h3>
          <label className="select-field">Floor material<select aria-label="Floor material" onChange={(event) => dispatch({ type: "SET_ROOM_3D", changes: { floorMaterialId: event.currentTarget.value } })} value={project.room3d.floorMaterialId}>{Object.values(MATERIALS).map((material) => <option key={material.id} value={material.id}>{material.displayName}</option>)}</select></label>
          <label className="select-field">Ceiling material<select aria-label="Ceiling material" onChange={(event) => dispatch({ type: "SET_ROOM_3D", changes: { ceilingMaterialId: event.currentTarget.value } })} value={project.room3d.ceilingMaterialId}>{Object.values(MATERIALS).map((material) => <option key={material.id} value={material.id}>{material.displayName}</option>)}</select></label>
          <NumericScrubField fineStep={0.01} label="Width" max={50} min={1} onCommit={(widthM) => applyConstraint(resizeRoomAndClamp(project, { ...project.room3d, widthM }))} step={0.1} unit="m" value={project.room3d.widthM} />
          <NumericScrubField fineStep={0.01} label="Depth" max={50} min={1} onCommit={(depthM) => applyConstraint(resizeRoomAndClamp(project, { ...project.room3d, depthM }))} step={0.1} unit="m" value={project.room3d.depthM} />
          {project.mode === "hybrid-3d" ? <NumericScrubField fineStep={0.01} label="Height" max={12} min={2} onCommit={(heightM) => applyConstraint(resizeRoomAndClamp(project, { ...project.room3d, heightM }))} step={0.1} unit="m" value={project.room3d.heightM} /> : null}
        </section>
      ) : null}
      {selection ? (
        <section className="inspector-actions">
          {!(selection.type === "surface" && (selection.id === "floor" || selection.id === "room")) ? <button onClick={() => dispatch({ type: "SET_ENTITY_ENABLED", entity: selection, enabled: disabled })} type="button">{disabled ? "Enable" : "Disable"}</button> : null}
          {selection.type !== "surface" ? <button onClick={() => setConfirmDelete(selection)} type="button">Delete</button> : null}
        </section>
      ) : <HintCard title="Select an object">Choose an item in the Outliner or viewport to edit exact values.</HintCard>}
      {confirmDelete ? <div aria-label="Confirm delete" aria-modal="true" className="workspace-confirm-card" role="alertdialog"><strong>Delete {confirmDelete.type}?</strong><p>This permanently removes the object and follows Portal cascade rules.</p><button autoFocus onClick={() => deleteConfirmed(confirmDelete)} type="button">Delete {confirmDelete.type}</button><button onClick={() => setConfirmDelete(null)} type="button">Cancel</button></div> : null}
      {project.notice ? <div className="workspace-notice" role="status"><span>{project.notice.message}</span><button aria-label="Dismiss notice" onClick={() => dispatch({ type: "CLEAR_NOTICE" })} type="button">×</button></div> : null}
    </aside>
  );
}
