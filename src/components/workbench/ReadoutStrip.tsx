import type { EditorSelection } from "@/domain/editor/state";
import type { SceneSpec } from "@/domain/scene/types";

type ReadoutStripProps = Readonly<{
  scene: SceneSpec;
  selection: EditorSelection;
}>;

export function ReadoutStrip({ scene, selection }: ReadoutStripProps) {
  const selectedSource =
    selection?.type === "source"
      ? scene.sources.find(({ id }) => id === selection.id)
      : undefined;
  const source = selectedSource ?? scene.sources[0];
  const distance = source
    ? Math.hypot(
        source.position.x - scene.listener.position.x,
        source.position.y - scene.listener.position.y,
      )
    : 0;

  return (
    <section className="diagnostic-strip" aria-label="Acoustic preview status">
      <p className="route-sentence">
        <span className="signal-glyph" aria-hidden="true">↗</span>
        {source ? `${source.name} is ${distance.toFixed(2)} m from the listener.` : "No active source."}
      </p>
      <dl>
        <div>
          <dt>Distance</dt>
          <dd>{distance.toFixed(2)} m</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>Direct preview</dd>
        </div>
        <div>
          <dt>Gain</dt>
          <dd>— dB</dd>
        </div>
        <div>
          <dt>Cutoff</dt>
          <dd>— Hz</dd>
        </div>
      </dl>
    </section>
  );
}
