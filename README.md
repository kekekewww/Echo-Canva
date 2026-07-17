# Echo Canvas

Echo Canvas is a browser-based spatial-audio prototyping and previsualization tool for OpenAI Build Week 2026. The current Gate C candidate provides a deterministic 2D scene editor, local mono demo sources, Raw/Simulated A/B preview, browser HRTF rendering, Worker-driven direct-path occlusion, portal-aware sound propagation, first-order early reflections, and a perceptually tuned Schroeder late-reverb preview.

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

Open `http://127.0.0.1:3000`. No account, OpenAI key, or network audio asset is required for the preset-only Gate C candidate. Audio begins only after **Start Audio** is pressed.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

The browser suite starts its own local application server. The detailed human scripts and current verification evidence are in [`docs/STATUS.md`](docs/STATUS.md) and [`docs/ACCEPTANCE_TESTS.md`](docs/ACCEPTANCE_TESTS.md).

## Gate C demo

### Reflection + room character

1. Start audio and choose **Simulated**.
2. Load **Hard Room** and inspect the Low/Mid/High Eyring RT60 estimates, pre-delay, room surface/volume, and amber dashed first-order reflection paths.
3. Load **Treated Room** and compare the lower Mid/High decay estimates and less sustained simulated character.
4. Move a source, listener, or wall while audio runs; only the current scene revision's acoustic frame is displayed.

### Portal comparison

1. Start audio in the Concrete Partition preset.
2. Switch Raw and Simulated without restarting the source loops.
3. In Simulated mode, move the listener below the center doorway; inspect the portal route, effective distance, direct gain, low-pass, and cyan route overlay.
4. Close the portal and inspect the blocked fallback, `partition_center` occluder, and red wall highlight; reopen it to compare the route.
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

The persistent audio graph updates gain, low-pass, panner, first-order reflection taps, and Schroeder reverb parameters through automation. The Worker computes deterministic direct-path occlusion, portal routes, image-source reflections, and three-band Eyring RT60; the UI renders only the matching selected-source frame. The `SceneSpec.settings.hrtfEnabled` flag selects `HRTF` or `equalpower` panning without rebuilding source graphs.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ACOUSTICS.md`](docs/ACOUSTICS.md), and [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) for the contracts and model boundaries.

## Codex and GPT-5.6

Codex is the principal implementation and release workflow: it follows [`AGENTS.md`](AGENTS.md), adds regression tests before fixes, runs the quality gates, and records deviations in [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md).

GPT-5.6 is intentionally a control-plane component for later gates. It will compile bounded natural-language intent into a strict `SceneSpec` and explain a deterministic `AcousticSnapshot`. It will not calculate acoustics, set Web Audio parameters, execute generated code, invent registry IDs, or load arbitrary URLs. The preset editor remains usable when the OpenAI API is unavailable.

## Assets, license, and limitations

- Demo audio is generated locally by [`scripts/generate-audio-assets.mjs`](scripts/generate-audio-assets.mjs) and stored as mono WAV files under `public/audio/`.
- Application code is licensed under the [MIT License](LICENSE).
- Primary browser targets are current desktop Chrome and Edge.
- External device changes and browser-initiated `AudioContext` interruption observation remain a documented follow-up; explicit Start, Stop, resume, and error lifecycle are covered.
- First-order reflections and late reverberation are perceptually tuned approximations, not architectural-acoustics measurement or certification. The live UI uses continuous-loop assets rather than a separate one-shot impulse audition; automated Chromium validation nevertheless renders the production Schroeder network through `OfflineAudioContext` to check finite/non-clipping output and an equal-band RT60 target. The editor does not expose outer-room scale editing; room-scale math is covered by deterministic unit tests.
- GPT-5.6 endpoints, import/export UI, and deployment are later checklist items and are not represented as complete in this Gate C candidate.
