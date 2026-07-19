import type { EntityRef, WorkspaceProject } from "@/domain/workspace/types";

type Props = Readonly<{
  project: WorkspaceProject;
  onSelect: (selection: EntityRef) => void;
}>;

export function SceneOutliner({ project, onSelect }: Props) {
  const disabled = new Set(project.disabledEntityIds);
  const row = (entity: EntityRef, label: string, kind: string, active = false, enabled = true) => (
    <button
      aria-pressed={project.selection?.type === entity.type && project.selection.id === entity.id}
      className={`outliner-row kind-${kind}${enabled ? "" : " is-disabled"}`}
      key={`${entity.type}-${entity.id}`}
      onClick={() => onSelect(entity)}
      type="button"
    >
      <i aria-hidden="true" />
      <span>{label}</span>
      {active ? <em>Active</em> : null}
      {!enabled ? <em>Off</em> : null}
    </button>
  );
  return (
    <aside className="workspace-outliner" aria-label="Scene Outliner">
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
