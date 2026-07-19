const ITEMS = [
  { kind: "listener", glyph: "L", label: "Listener" },
  { kind: "source", glyph: "S", label: "Source" },
  { kind: "wall", glyph: "W", label: "Wall" },
  { kind: "portal", glyph: "P", label: "Portal" },
] as const;

export function AddObjectMenu({ onAdd, onClose }: Readonly<{
  onAdd: (kind: "listener" | "source" | "wall" | "portal") => void;
  onClose: () => void;
}>) {
  return (
    <div className="add-object-popover" role="dialog" aria-label="Add object">
      <header><strong>Add object</strong><button aria-label="Close" onClick={onClose} type="button">×</button></header>
      {ITEMS.map(({ kind, glyph, label }) => (
        <button data-testid={`add-${kind}`} key={kind} onClick={() => { onAdd(kind); onClose(); }} type="button">
          <span aria-hidden="true">{glyph}</span>{label}
        </button>
      ))}
    </div>
  );
}
