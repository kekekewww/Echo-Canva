# Echo Canvas

Echo Canvas is a browser-based spatial-audio prototyping and previsualization tool for OpenAI Build Week 2026. It provides one modelling-style workspace with independent cached 2.5D and 3D projects, deterministic acoustic previews, browser HRTF rendering, GPT-5.6 scene compilation, and grounded acoustic explanations.

The product is an **interactive acoustic approximation**. It is not an architectural-acoustics measurement tool and does not claim physically accurate diffraction.

## Unified modelling workspace

- Switch **2.5D / 3D** without converting or overwriting either project. Each mode is restored from its own versioned local cache.
- Select objects in the Outliner or viewport, then edit exact values in the Inspector. Numeric fields accept typed units, arrow keys, and horizontal scrubbing; `Shift` is fine adjustment and `Ctrl` snaps to the normal step.
- Add up to eight listeners and four point sources. Exactly one enabled listener is active; selecting another listener switches the acoustic receiver.
- Add built-in or device-local WAV/MP3/Ogg sources. Local files are decoded and stored in the browser only, with a 25 MB file limit and 100 MB library limit; they are never sent to an API route.
- In 3D, edit room size plus finite wall and Portal thickness, bottom, and top. Walls and objects are directly selectable in the viewport; source/listener positions and wall endpoints are draggable.
- **Disable** is reversible and removes an entity from rendering and acoustic compilation while retaining it in the Outliner. **Delete** removes it. The floor and final enabled listener are protected.
- 3D path overlays use the same accepted Worker revision as audio and show direct, blocked, Portal-aware, and first-order floor/ceiling/wall reflection paths.
- Undo/Redo is bounded to 50 scene changes. Reset affects only the active mode and is undoable during the current session.

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

Open `http://127.0.0.1:3000`. No account, API key, or network audio asset is required for presets and manual editing. Audio begins only after **Start Audio** is pressed.

### Optional AI configuration

The key is server-side only. Never paste it into the browser, chat, source files, or Git. The application remains fully usable in preset/manual mode without a key.

For the owner's OpenRouter Luna test configuration, create/edit `.env.local`:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
```

This explicitly selects `openai/gpt-5.6-luna` for both scene compilation and acoustic explanation. Restart the local server after saving the file. To use the canonical OpenAI configuration instead, omit `AI_PROVIDER` (or set it to `openai`) and set `OPENAI_API_KEY`. OpenRouter is an opt-in compatibility-test path; the existing no-key fallback remains available if any provider request fails.

### Scene transfer

Use **Import / export** in the Inspector to download or restore the current validated scene. Import accepts only a supported, versioned Echo Canvas scene smaller than 1 MB; invalid or unsupported JSON is rejected without changing the current project.

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
        |                         GPT-5.6 control plane
        |                         server-only compile / explanation
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

GPT-5.6 is a server-only control-plane component. It compiles bounded natural-language intent into a strict `SceneSpec` and explains a finite deterministic acoustic projection through strict Structured Outputs. It never calculates acoustics, sets Web Audio parameters, executes generated code, invents registry IDs, or loads arbitrary URLs. Static developer policy is kept separate from untrusted scene names, source names, and snapshot data; model-produced URLs, markup, executable protocols, and instruction-like labels are rejected before acceptance. Explanation output is rejected if it introduces numeric evidence absent from the deterministic snapshot; the UI always states that portal routing is a geometric perceptual approximation. The preset editor remains usable when no configured provider is available.

## Assets, license, and limitations

- Demo audio is generated locally by [`scripts/generate-audio-assets.mjs`](scripts/generate-audio-assets.mjs) and stored as mono WAV files under `public/audio/`.
- Application code is licensed under the [MIT License](LICENSE).
- Primary browser targets are current desktop Chrome and Edge.
- External device changes and browser-initiated `AudioContext` interruption observation remain a documented follow-up; explicit Start, Stop, resume, and error lifecycle are covered.
- First-order reflections and late reverberation are perceptually tuned approximations, not architectural-acoustics measurement or certification. The live UI uses continuous-loop assets rather than a separate one-shot impulse audition; automated Chromium validation nevertheless renders the production Schroeder network through `OfflineAudioContext` to check finite/non-clipping output on each stereo channel, an equal-band RT60 target from summed stereo energy, and a relative Raw/Simulated transition-continuity limit. The editor does not expose outer-room scale editing; room-scale math is covered by deterministic unit tests.
- Local-audio blobs are intentionally not embedded in scene JSON; another browser must relink a missing local asset.
- The 3D room is rectangular and acoustic paths remain first-order deterministic approximations. True diffraction, arbitrary room meshes, and simultaneous rendering for multiple listeners are outside this release.
