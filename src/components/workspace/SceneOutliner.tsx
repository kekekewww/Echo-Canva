import type { EntityRef, WorkspaceProject } from "@/domain/workspace/types";
import { memo } from "react";

type Props = Readonly<{
  project: WorkspaceProject;
  onSelect: (selection: EntityRef) => void;
  mobileOpen?: boolean;
}>;

const OutlinerEntityRow = memo(function OutlinerEntityRow({
  type,
  id,
  label,
  kind,
  active,
  enabled,
  selected,
  onSelect,
}: Readonly<{
  type: EntityRef["type"];
  id: string;
  label: string;
  kind: string;
  active: boolean;
  enabled: boolean;
  selected: boolean;
  onSelect: (selection: EntityRef) => void;
}>) {
  return (
    <button
      aria-pressed={selected}
      className={`outliner-row kind-${kind}${enabled ? "" : " is-disabled"}`}
      onClick={() => onSelect({ type, id })}
      type="button"
    >
      <i aria-hidden="true" />
      <span>{label}</span>
      {active ? <em>Active</em> : null}
      {!enabled ? <em>Off</em> : null}
    </button>
  );
});

export function SceneOutliner({ project, onSelect, mobileOpen = false }: Props) {
  const disabled = new Set(project.disabledEntityIds);
  const row = (entity: EntityRef, label: string, kind: string, active = false, enabled = true) => (
    <OutlinerEntityRow
      active={active}
      enabled={enabled}
      id={entity.id}
      key={`${entity.type}-${entity.id}`}
      kind={kind}
      label={label}
      onSelect={onSelect}
      selected={project.selection?.type === entity.type && project.selection.id === entity.id}
      type={entity.type}
    />
  );
  return (
    <aside aria-label="Scene Outliner" aria-modal={mobileOpen || undefined} className={`workspace-outliner${mobileOpen ? " is-mobile-open" : ""}`} role={mobileOpen ? "dialog" : undefined}>
      <header><span>Scene</span><small>{project.mode === "hybrid-3d" ? "3D" : "2.5D"}</small></header>
      <nav>
        <p>Listeners</p>
        {project.listeners.map((listener) => row(
          { type: "listener", id: listener.id },
          listener.name,
          "listener",
          listener.id === project.activeListenerId,
          listener.enabled,
        ))}
        <p>Sources</p>
        {project.scene.sources.map((source) => row(
          { type: "source", id: source.id }, source.name, "source", false, !disabled.has(source.id),
        ))}
        <p>Geometry</p>
        {project.scene.walls.map((wall) => row(
          { type: "wall", id: wall.id }, wall.id.replaceAll("_", " "), "wall", false, !disabled.has(wall.id),
        ))}
        {project.scene.portals.map((portal) => row(
          { type: "portal", id: portal.id }, portal.id.replaceAll("_", " "), "portal", false, !disabled.has(portal.id),
        ))}
        <p>Room</p>
        {row({ type: "surface", id: "room" }, "Room dimensions", "surface")}
        {project.mode === "hybrid-3d" ? (
          <>
            <p>Surfaces</p>
            {row({ type: "surface", id: "floor" }, "Floor", "surface")}
            {row({ type: "surface", id: "ceiling" }, "Ceiling", "surface", false, !disabled.has("ceiling"))}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
