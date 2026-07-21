# Echo Canvas

Echo Canvas is a browser-based spatial-audio prototyping and previsualization tool for OpenAI Build Week 2026. It provides one modelling-style workspace with independent cached 2.5D and 3D projects, deterministic acoustic previews, browser HRTF rendering, GPT-5.6 scene compilation, and grounded acoustic explanations.

The product is an **interactive acoustic approximation**. It is not an architectural-acoustics measurement tool and does not claim physically accurate diffraction.

**Public demo:** [echo-canva.vercel.app](https://echo-canva.vercel.app) — use a current desktop Chrome or Edge browser and headphones. No installation or account is required. Presets, manual editing, and deterministic audio work without a key; optional GPT features use each visitor's own OpenRouter key.

## Unified modelling workspace

- Switch **2.5D / 3D** without converting or overwriting either project. Each mode is restored from its own versioned local cache.
- Navigate either viewport with middle-button drag or Shift + left drag on empty space. The wheel zooms around the cursor without scrolling the page; **Home** restores the default view and **Frame All** fits enabled scene content. Each mode persists its own presentation camera.
- Select objects in the Outliner or viewport, then edit exact values in the Inspector. Numeric fields accept typed units, arrow keys, and horizontal scrubbing; `Shift` is fine adjustment and `Ctrl` snaps to the normal step.
- Add up to eight listeners and four point sources. Exactly one enabled listener is active; selecting another listener switches the acoustic receiver.
- Add built-in or device-local WAV/MP3/Ogg sources. Local files are decoded and stored in the browser only, with a 25 MB file limit and 100 MB library limit; they are never sent to an API route.
- In 3D, edit room size plus finite wall and Portal thickness, bottom, and top. Walls and objects are directly selectable in the viewport; source/listener positions and wall endpoints are draggable.
- Add up to eight Box, Cylinder, or Sphere acoustic obstacles in either mode, then edit XYZ position and dimensions, Y rotation, material, enabled state, and name from the contextual Inspector.
- **Disable** is reversible and removes an entity from rendering and acoustic compilation while retaining it in the Outliner. **Delete** removes it. The floor and final enabled listener are protected.
- Both path overlays use the same accepted Worker revision as audio and show direct, blocked, Portal-aware, first-order, and bounded second-order reflection paths.
- Undo/Redo is persisted as at most 50 compact reversible commands per mode. Continuous scrubbing is coalesced into one command. Reset affects only the active mode and is undoable.
- Authoring JSON preserves listeners, finite geometry, disabled state, camera pan/zoom/overlay preferences, and local-audio metadata without embedding blobs. Missing files remain silent and can be relinked in place.

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

Open `http://127.0.0.1:3000`. No account, API key, or network audio asset is required for presets and manual editing. Audio begins only after **Play** is pressed.

### Optional AI access (bring your own key)

Open **Settings → AI access**, paste your own OpenRouter API key, and choose **Save for this tab**. Scene compilation and acoustic explanation then use the fixed `openai/gpt-5.6-luna` model. No owner or deployment API key is used.

The key is held only in the current tab's `sessionStorage`; it is not included in project cache, JSON exports, source files, or server persistence. AI requests send it over HTTPS to the same-origin server route, which creates a request-scoped OpenRouter client. The application code does not log, return, or retain the key after that request. **Forget key** removes it immediately, and closing the tab clears it automatically.

Like any browser-held secret, the key is visible to the user in their own browser developer tools and could be exposed by a successful same-origin script injection. Use a limited OpenRouter key with an appropriate spending cap. The application remains fully usable in preset/manual mode without a key.

### Scene transfer

Use **Import / export** in the Inspector to download or restore the active mode's complete authoring project. Invalid, unsupported, or wrong-mode JSON is rejected atomically. Local-audio metadata is exported, but blobs remain private in IndexedDB; another browser reports those Sources as **Relink required**.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

The browser suite starts its own local application server. The detailed human scripts and current verification evidence are in [`docs/STATUS.md`](docs/STATUS.md) and [`docs/ACCEPTANCE_TESTS.md`](docs/ACCEPTANCE_TESTS.md).

The maximum-entity browser case keeps its long-task observer active across all 24 measured Listener switches, requires every recorded task to remain at or below 50 ms, and preserves the Worker p95 wall-latency budget below 12 ms. It also derives the exact expected active Worker count from the browser's own `navigator.hardwareConcurrency` and checks the completed four-source Hybrid frame against it.

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

The stress preset is deterministic. Playwright measures selection and keyboard movement from the initiating event to the rendered DOM mutation with an in-page `MutationObserver` and `performance.now()`; both must complete in under 50 ms. To inspect multicore use manually, load the four-source stress project, wait for **Ready**, open the status bar's **Debug** disclosure, and read the Worker count. The expected value is `min(4 sources, min(4, max(1, floor(navigator.hardwareConcurrency) - 2)))`; on a browser exposing at least four logical cores this is at least two. One-source scenes intentionally display one active Worker.

## Architecture

```text
React / Next.js workbench
        |
        v
validated, versioned SceneSpec
        |                         GPT-5.6 control plane
        |                         server-only compile / explanation
        v
main-thread coordinator
        |
        v
1–4 persistent source Workers (deterministic acoustic pipeline)
        |
        v
persistent Web Audio graph
Raw bus <-> Simulated distance + browser HRTF bus
        |
        v
headphones
```

The persistent audio graph updates gain, low-pass, panner, ranked early-reflection taps, and Schroeder reverb parameters through automation. Each active mode uses a main-thread coordinator plus one to four persistent source Workers, capped at four and reserving two logical cores when possible. Per-source direct-path occlusion, Portal routes, first-order image-source work, and blocked-route second-order work are deterministically sharded, semantically validated, and atomically merged; Classic room values remain frame-level. Second-order search considers at most 24 representative walls or physical surfaces (at most 552 ordered pairs), prunes by path length and specular energy, then shares the existing fixed six-tap bank with first-order paths. Each Hybrid Worker owns a cloned cached BVH, receives compact pose updates, and reinstalls geometry after a static edit. Static-install acknowledgements are tracked exactly once, and a configurable per-job watchdog prevents a silent Worker from leaving the preview stuck. The UI renders only the matching selected-source frame and exposes accepted revision/request sequence, pool wall latency, Worker count, and shard timing in **Debug**. If any pool member fails or times out, partial work is discarded and complete deterministic serial fallback continues while the status reads `Fallback`.

This is bounded CPU source sharding for an interactive acoustic approximation. It is not GPU acceleration and does not establish physical or architectural-acoustics accuracy. The `SceneSpec.settings.hrtfEnabled` flag selects `HRTF` or `equalpower` panning without rebuilding source graphs.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ACOUSTICS.md`](docs/ACOUSTICS.md), and [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) for the contracts and model boundaries.

## Codex and GPT-5.6

Codex is the principal implementation and release workflow: it follows [`AGENTS.md`](AGENTS.md), adds regression tests before fixes, runs the quality gates, and records deviations in [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md).

GPT-5.6 is a server-only control-plane component. It compiles bounded natural-language intent into a strict Classic `SceneSpec` or a strict Hybrid `{scene, spatial3d}` authoring candidate and explains a finite deterministic acoustic projection through Structured Outputs. Hybrid generation maps world X/Z into the planar scene, preserves world Y through ID-bound Listener/source heights and Wall/Portal vertical bounds, and may include up to eight validated basic acoustic shapes. It never calculates acoustics, sets Web Audio parameters, executes generated code, invents registry IDs, or loads arbitrary URLs. Static developer policy is kept separate from untrusted scene names, source names, shape names, and snapshot data; model-produced URLs, markup, executable protocols, and instruction-like labels are rejected before acceptance. Explanation output is rejected if it introduces numeric evidence absent from the deterministic snapshot; the UI always states that portal routing is a geometric perceptual approximation. The preset editor remains usable when no configured provider is available.

## Assets, license, and limitations

- Demo audio is generated locally by [`scripts/generate-audio-assets.mjs`](scripts/generate-audio-assets.mjs) and stored as mono WAV files under `public/audio/`.
- Application code is licensed under the [MIT License](LICENSE).
- Primary browser targets are current desktop Chrome and Edge.
- External device changes and browser-initiated `AudioContext` interruption observation remain a documented follow-up; explicit Play, Stop, resume, and Retry lifecycle are covered.
- First-order and bounded second-order reflections plus late reverberation are perceptually tuned approximations, not architectural-acoustics measurement or certification. The live UI uses continuous-loop assets rather than a separate one-shot impulse audition; automated Chromium validation nevertheless renders the production Schroeder network through `OfflineAudioContext` to check finite/non-clipping output, decay, and Raw/Simulated transition continuity. Room width/depth are editable in both modes; 3D also exposes room height and floor/ceiling materials.
- Local-audio blobs are intentionally not embedded in scene JSON; another browser must relink a missing local asset.
- The 3D room is rectangular. Second-order search is bounded to blocked direct routes in either mode; third- and higher-order reflections, true diffraction, arbitrary room meshes, and simultaneous rendering for multiple listeners are outside this release.
