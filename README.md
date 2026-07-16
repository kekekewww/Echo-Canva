# Echo Canvas

Echo Canvas is a browser-based spatial-audio prototyping and previsualization tool for OpenAI Build Week 2026. The current Gate A candidate provides a deterministic 2D scene editor, local mono demo sources, Raw/Simulated A/B preview, manual distance attenuation, and browser HRTF rendering through the Web Audio API.

The product is an **interactive acoustic approximation**. It is not an architectural-acoustics measurement tool and does not claim physically accurate diffraction.

## Run locally

Requirements:

- Node.js 22.17 or newer;
- pnpm 11.7.0;
- a current desktop Chrome or Edge browser;
- headphones for the human panning check.

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:3000`. No account, OpenAI key, or network audio asset is required for the preset-only Gate A demo. Audio begins only after **Start Audio** is pressed.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

The browser suite starts its own local application server. The detailed human scripts and current verification evidence are in [`docs/STATUS.md`](docs/STATUS.md) and [`docs/ACCEPTANCE_TESTS.md`](docs/ACCEPTANCE_TESTS.md).

## Gate A demo

1. Start audio in the Concrete Partition preset.
2. Switch Raw and Simulated without restarting the source loops.
3. In Simulated mode, move a source around the listener and hear browser HRTF panning with smooth distance changes.
4. Add, select, reshape, recolor, and delete walls; move the listener and sources; toggle the portal.
5. Load **Stress Test — 100 Walls** to exercise the editor budget and see the visible wall-limit feedback.

The stress preset is deterministic. Playwright measures selection and keyboard movement from the initiating event to the rendered DOM mutation with an in-page `MutationObserver` and `performance.now()`; both must complete in under 50 ms.

## Architecture

```text
React / Next.js workbench
        |
        v
validated, versioned SceneSpec
        |                         future control plane
        |                         GPT-5.6 scene compiler / explanation
        v
deterministic acoustic pipeline   (server-side, strict structured output)
        |
        v
persistent Web Audio graph
Raw bus <-> Simulated distance + browser HRTF bus
        |
        v
headphones
```

Gate A creates each source graph once and updates gain and panner parameters through automation. The `SceneSpec.settings.hrtfEnabled` flag selects `HRTF` or `equalpower` panning without rebuilding source graphs. Later frozen-scope milestones add the Web Worker, exact direct-path occlusion, portal-aware sound propagation, first-order early reflections, Eyring RT60, and Schroeder late reverberation.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ACOUSTICS.md`](docs/ACOUSTICS.md), and [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) for the contracts and model boundaries.

## Codex and GPT-5.6

Codex is the principal implementation and release workflow: it follows [`AGENTS.md`](AGENTS.md), adds regression tests before fixes, runs the quality gates, and records deviations in [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md).

GPT-5.6 is intentionally a control-plane component for later gates. It will compile bounded natural-language intent into a strict `SceneSpec` and explain a deterministic `AcousticSnapshot`. It will not calculate acoustics, set Web Audio parameters, execute generated code, invent registry IDs, or load arbitrary URLs. The preset editor remains usable when the OpenAI API is unavailable.

## Assets, license, and limitations

- Demo audio is generated locally by [`scripts/generate-audio-assets.mjs`](scripts/generate-audio-assets.mjs) and stored as mono WAV files under `public/audio/`.
- Application code is licensed under the [MIT License](LICENSE).
- Primary browser targets are current desktop Chrome and Edge.
- External device changes and browser-initiated `AudioContext` interruption observation are a documented Gate B follow-up; Gate A covers explicit Start, Stop, resume, and error lifecycle only.
- Occlusion, portal routing, reflections, reverberation, GPT-5.6 endpoints, import/export UI, and deployment are later checklist items and are not represented as complete in this Gate A candidate.
