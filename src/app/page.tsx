import { APP_NAME } from "@/domain/app-meta";

export default function HomePage() {
  return (
    <main className="app-shell" data-testid="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Spatial-audio field workstation</p>
          <h1>{APP_NAME}</h1>
        </div>
        <p className="system-status">
          <span className="status-dot" aria-hidden="true" />
          Foundation online
        </p>
      </header>

      <section className="workstation" aria-labelledby="workspace-title">
        <div className="panel canvas-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Scene workspace</p>
              <h2 id="workspace-title">Plan view</h2>
            </div>
            <p className="measurement">Units: meters</p>
          </div>

          <div className="canvas-field">
            <div className="canvas-message">
              <span aria-hidden="true">EC / 01</span>
              <p>Editor instruments connect in the next build slice.</p>
            </div>
          </div>

          <div className="readout-strip" aria-label="Acoustic preview status">
            <span>Route</span>
            <strong>Not evaluated</strong>
            <span>Renderer</span>
            <strong>Idle</strong>
          </div>
        </div>

        <aside className="panel context-panel" aria-labelledby="context-title">
          <p className="panel-label">Instrument context</p>
          <h2 id="context-title">Preview foundation</h2>
          <p>
            A browser workspace for spatial-audio prototyping and
            previsualization.
          </p>
          <dl>
            <div>
              <dt>Model</dt>
              <dd>Interactive acoustic approximation</dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>Browser HRTF rendering</dd>
            </div>
          </dl>
          <p className="context-note">
            Audio remains off until an explicit start action is available.
          </p>
        </aside>
      </section>
    </main>
  );
}
