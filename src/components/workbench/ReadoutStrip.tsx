import { dbToLinear, distanceAttenuation, linearToDb } from "@/audio/math";
import type { AudioEngineDiagnostics } from "@/audio/types";
import type { EditorSelection } from "@/domain/editor/state";
import type { SceneSpec } from "@/domain/scene/types";

type ReadoutStripProps = Readonly<{
  scene: SceneSpec;
  selection: EditorSelection;
  audioDiagnostics: AudioEngineDiagnostics;
}>;

export function ReadoutStrip({ scene, selection, audioDiagnostics }: ReadoutStripProps) {
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
  const directGainDb = source
    ? linearToDb(dbToLinear(source.gainDb) * distanceAttenuation(distance))
    : -160;

  return (
    <section className="diagnostic-strip" aria-label="Acoustic preview status">
      <p className="route-sentence">
        <span className="signal-glyph" aria-hidden="true">∿</span>
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
          <dd>{directGainDb.toFixed(1)} dB</dd>
        </div>
        <div>
          <dt>Audio</dt>
          <dd>{audioDiagnostics.status}</dd>
        </div>
      </dl>
    </section>
  );
}
