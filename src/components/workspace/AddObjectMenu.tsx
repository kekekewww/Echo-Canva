const ITEMS = [
  { kind: "listener", glyph: "L", label: "Listener" },
  { kind: "source", glyph: "S", label: "Source" },
  { kind: "wall", glyph: "W", label: "Wall" },
  { kind: "portal", glyph: "P", label: "Portal" },
] as const;

export function AddObjectMenu({ onAdd, onClose, availability = {} }: Readonly<{
  onAdd: (kind: "listener" | "source" | "wall" | "portal") => void;
  onClose: () => void;
  availability?: Partial<Record<"listener" | "source" | "wall" | "portal", Readonly<{ enabled: boolean; reason?: string }>>>;
}>) {
  return (
    <div className="add-object-popover" role="dialog" aria-modal="true" aria-label="Add object">
      <header><strong>Add object</strong><button aria-label="Close" onClick={onClose} type="button">×</button></header>
      {ITEMS.map(({ kind, glyph, label }) => {
        const state = availability[kind];
        return (
          <button autoFocus={kind === "listener"} data-testid={`add-${kind}`} disabled={state?.enabled === false} key={kind} onClick={() => { onAdd(kind); onClose(); }} title={state?.reason} type="button">
            <span aria-hidden="true">{glyph}</span>{label}{state?.reason ? <small>{state.reason}</small> : null}
          </button>
        );
      })}
    </div>
  );
}
