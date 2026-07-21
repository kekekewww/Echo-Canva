const ITEMS = [
  { kind: "listener", glyph: "L", label: "Listener", group: "Scene" },
  { kind: "source", glyph: "S", label: "Source", group: "Scene" },
  { kind: "wall", glyph: "W", label: "Wall", group: "Geometry" },
  { kind: "portal", glyph: "P", label: "Portal", group: "Geometry" },
  { kind: "box", glyph: "□", label: "Box", group: "Basic shapes" },
  { kind: "cylinder", glyph: "○", label: "Cylinder", group: "Basic shapes" },
  { kind: "sphere", glyph: "●", label: "Sphere", group: "Basic shapes" },
] as const;

type AddObjectKind = (typeof ITEMS)[number]["kind"];

export function AddObjectMenu({ onAdd, onClose, availability = {} }: Readonly<{
  onAdd: (kind: AddObjectKind) => void;
  onClose: () => void;
  availability?: Partial<Record<AddObjectKind, Readonly<{ enabled: boolean; reason?: string }>>>;
}>) {
  return (
    <div className="add-object-popover" role="dialog" aria-modal="true" aria-label="Add object">
      <header><strong>Add object</strong><button aria-label="Close" onClick={onClose} type="button">×</button></header>
      {ITEMS.map(({ kind, glyph, label, group }, index) => {
        const state = availability[kind];
        const showGroup = index === 0 || ITEMS[index - 1]?.group !== group;
        return (
          <div className="add-object-item" key={kind}>
            {showGroup ? <p>{group}</p> : null}
            <button autoFocus={kind === "listener"} data-testid={`add-${kind}`} disabled={state?.enabled === false} onClick={() => { onAdd(kind); onClose(); }} title={state?.reason} type="button">
              <span aria-hidden="true">{glyph}</span>{label}{state?.reason ? <small>{state.reason}</small> : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}
