import Link from "next/link";

import { HybridDirectLab } from "@/components/lab/HybridDirectLab";

export default function HybridLabPage() {
  return (
    <main className="app-shell" data-testid="hybrid-lab">
      <section className="canvas-panel" aria-labelledby="hybrid-lab-title">
        <p className="panel-kicker">Hybrid 3D / gated preview</p>
        <h1 id="hybrid-lab-title">Hybrid 3D Lab</h1>
        <p>
          The compatibility foundation and 3D direct-propagation beta are active. This route is
          isolated from the validated Classic preview while reflection and late-field gates remain pending.
        </p>
        <p className="control-note">
          Classic 2.5D remains the default interactive acoustic approximation while Hybrid 3D
          passes its reflection, material, and browser-audio release gates.
        </p>
        <HybridDirectLab />
        <Link className="primary-action" href="/classic">
          Open Classic 2.5D
        </Link>
      </section>
    </main>
  );
}
