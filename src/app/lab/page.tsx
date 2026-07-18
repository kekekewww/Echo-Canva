import Link from "next/link";

export default function HybridLabPage() {
  return (
    <main className="app-shell" data-testid="hybrid-lab">
      <section className="canvas-panel" aria-labelledby="hybrid-lab-title">
        <p className="panel-kicker">Hybrid 3D / gated preview</p>
        <h1 id="hybrid-lab-title">Hybrid 3D Lab</h1>
        <p>
          The compatibility foundation is active. The 3D direct-propagation solver is not yet
          enabled, so this route intentionally cannot replace the validated Classic preview.
        </p>
        <p className="control-note">
          Classic 2.5D remains the default interactive acoustic approximation while Hybrid 3D
          passes its analytic geometry and browser-audio release gates.
        </p>
        <Link className="primary-action" href="/classic">
          Open Classic 2.5D
        </Link>
      </section>
    </main>
  );
}
