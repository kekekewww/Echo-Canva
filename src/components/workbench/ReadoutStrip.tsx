import type { AcousticFrame } from "@/acoustics/compute-frame";
import type { AudioEngineDiagnostics } from "@/audio/types";
import type { EditorSelection, PreviewMode } from "@/domain/editor/state";
import type { SceneSpec } from "@/domain/scene/types";

type ReadoutStripProps = Readonly<{
  scene: SceneSpec;
  selection: EditorSelection;
  audioDiagnostics: AudioEngineDiagnostics;
  acousticFrame: AcousticFrame | null;
  mode: PreviewMode;
}>;

function routeLabel(routeType: "direct" | "portal" | "blocked"): string {
  return routeType === "direct"
    ? "Direct"
    : routeType === "portal"
      ? "Portal route"
      : "Blocked fallback";
}

export function ReadoutStrip({
  scene,
  selection,
  audioDiagnostics,
  acousticFrame,
  mode,
}: ReadoutStripProps) {
  const selectedSource =
    selection?.type === "source"
      ? scene.sources.find(({ id }) => id === selection.id)
      : undefined;
  const source = selectedSource ?? scene.sources[0];
  const sourceFrame = source
    ? acousticFrame?.sources.find(({ sourceId }) => sourceId === source.id)
    : undefined;
  const portalHostWallIds = sourceFrame?.portalIds.flatMap((portalId) => {
    const portal = scene.portals.find(({ id }) => id === portalId);
    return portal ? [portal.wallId] : [];
  }) ?? [];
  const route = sourceFrame ? routeLabel(sourceFrame.routeType) : null;
  const occluders = sourceFrame?.occluderWallIds ?? [];

  return (
    <section className="diagnostic-strip" aria-label="Acoustic preview status">
      <p className="route-sentence" aria-live="polite">
        <span className="signal-glyph" aria-hidden="true">~</span>
        {!sourceFrame
          ? "Computing acoustic preview…"
          : `${source?.name ?? "Active source"} route is ${sourceFrame.routeType}${portalHostWallIds.length ? ` via ${portalHostWallIds.join(", ")}` : ""}.`}
      </p>
      <dl>
        <div>
          <dt>Route</dt>
          <dd>{route ?? "Pending"}</dd>
        </div>
        <div>
          <dt>Effective distance</dt>
          <dd>{sourceFrame ? `${sourceFrame.effectiveDistanceM.toFixed(2)} m` : "—"}</dd>
        </div>
        <div>
          <dt>Direct gain</dt>
          <dd>{sourceFrame ? `${sourceFrame.dryGainDb.toFixed(1)} dB` : "—"}</dd>
        </div>
        <div>
          <dt>Low-pass</dt>
          <dd>{sourceFrame ? `${Math.round(sourceFrame.lowpassHz)} Hz` : "—"}</dd>
        </div>
        <div>
          <dt>Occluders</dt>
          <dd>{occluders.length ? occluders.join(", ") : "None"}</dd>
        </div>
        <div>
          <dt>{mode === "raw" ? "Raw source gain" : "Simulated direct gain"}</dt>
          <dd>
            {mode === "raw"
              ? `${source?.gainDb.toFixed(1) ?? "—"} dB`
              : sourceFrame
                ? `${sourceFrame.dryGainDb.toFixed(1)} dB`
                : "—"}
          </dd>
        </div>
        <div>
          <dt>Audio</dt>
          <dd>{audioDiagnostics.status}</dd>
        </div>
      </dl>
    </section>
  );
}
