import Link from "next/link";

import { HybridDirectLab } from "@/components/lab/HybridDirectLab";

export default function HybridLabPage() {
  return (
    <main className="app-shell" data-testid="hybrid-lab">
      <section className="canvas-panel hybrid-page-frame" aria-labelledby="hybrid-lab-title">
        <header className="hybrid-page-header">
          <div>
            <p className="panel-kicker">Spatial-audio prototyping / isolated beta</p>
            <h1 id="hybrid-lab-title">Hybrid 3D Lab</h1>
            <p>Manipulate a spatial pose, inspect its solved path, and audition the browser HRTF result.</p>
          </div>
          <aside className="hybrid-scope-note">
            <strong>Classic remains the default</strong>
            <span>Hybrid is a separately gated interactive acoustic approximation.</span>
          </aside>
        </header>
        <HybridDirectLab />
        <Link className="primary-action" href="/classic">
          Open Classic 2.5D
        </Link>
      </section>
    </main>
  );
}
