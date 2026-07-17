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
  const frameMatchesScene = acousticFrame?.revision === scene.revision;
  const selectedSource =
    selection?.type === "source"
      ? scene.sources.find(({ id }) => id === selection.id)
      : undefined;
  const source = selectedSource ?? scene.sources[0];
  const sourceFrame = frameMatchesScene && source
    ? acousticFrame?.sources.find(({ sourceId }) => sourceId === source.id)
    : undefined;
  const portalHostWallIds = sourceFrame?.portalIds.flatMap((portalId) => {
    const portal = scene.portals.find(({ id }) => id === portalId);
    return portal ? [portal.wallId] : [];
  }) ?? [];
  const route = sourceFrame ? routeLabel(sourceFrame.routeType) : null;
  const occluders = sourceFrame?.occluderWallIds ?? [];

  return (
    <section aria-label="Acoustic preview status">
      <div className="diagnostic-strip">
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
      </div>

      {frameMatchesScene && acousticFrame && sourceFrame ? (
        <section
          className="room-acoustic-diagnostics"
          data-testid="room-acoustic-diagnostics"
          data-frame-revision={acousticFrame.revision}
          data-rt60-low={acousticFrame.room.rt60S.low.toFixed(3)}
          data-rt60-mid={acousticFrame.room.rt60S.mid.toFixed(3)}
          data-rt60-high={acousticFrame.room.rt60S.high.toFixed(3)}
          data-reflection-count={sourceFrame.earlyReflections.length}
          aria-label="Room acoustic estimates"
        >
          <div className="room-acoustic-heading">
            <div>
              <p className="panel-kicker">Room character / selected source</p>
              <h3>Estimated Eyring RT60</h3>
            </div>
            <p className="reflection-count">
              <strong>{sourceFrame.earlyReflections.length}</strong> first-order taps
            </p>
          </div>
          <dl className="room-metrics">
            <div>
              <dt>Low</dt>
              <dd>{acousticFrame.room.rt60S.low.toFixed(2)} s</dd>
            </div>
            <div>
              <dt>Mid</dt>
              <dd>{acousticFrame.room.rt60S.mid.toFixed(2)} s</dd>
            </div>
            <div>
              <dt>High</dt>
              <dd>{acousticFrame.room.rt60S.high.toFixed(2)} s</dd>
            </div>
            <div>
              <dt>Pre-delay</dt>
              <dd>{Math.round(acousticFrame.room.preDelayMs)} ms</dd>
            </div>
            <div>
              <dt>Volume</dt>
              <dd>{acousticFrame.room.volumeM3.toFixed(1)} m³</dd>
            </div>
            <div>
              <dt>Surface</dt>
              <dd>{acousticFrame.room.totalSurfaceM2.toFixed(1)} m²</dd>
            </div>
          </dl>
          <div className="reflection-summary">
            <strong>First-order early reflections</strong>
            <span>
              {sourceFrame.earlyReflections.length
                ? `${sourceFrame.earlyReflections.length} ranked paths are drawn on the plan.`
                : "No valid first-order reflection paths for this source."}
            </span>
          </div>
          <p className="acoustic-limitation">
            <strong>Interactive acoustic approximation</strong>
            <span> — Eyring RT60 is an estimate, not an architectural-acoustics measurement.</span>
          </p>
        </section>
      ) : (
        <p className="room-acoustic-pending" aria-live="polite">
          Room estimates will appear when the matching acoustic frame is ready.
        </p>
      )}
    </section>
  );
}
