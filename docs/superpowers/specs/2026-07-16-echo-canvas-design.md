# Echo Canvas MVP Design

Status: Approved by the owner's 2026-07-16 instruction to execute the supplied OpenAI Build Week plan.

## Product outcome

Echo Canvas is a browser-based spatial-audio prototyping and previsualization tool. A judge can load a deterministic preset, start audio with one explicit gesture, move a listener and mono point sources on a 2D plan, and compare raw audio with browser-HRTF rendering. Later gates add occlusion, portal-aware sound propagation, first-order early reflections, late reverberation, and GPT-5.6 scene compilation.

## Gate structure

The owner only accepts five human gates. This first implementation cycle ends at Gate A and includes checklist items 1-4: repository bootstrap, domain contracts and fixtures, the editor workflow, and persistent direct-path Web Audio rendering. Acoustic occlusion and portal routing remain absent until Gate B.

## Architecture

- Next.js App Router hosts the React interface and later server-only OpenAI routes.
- A dependency-free domain layer owns `SceneSpec`, registries, fixtures, validation, and serialization.
- A small scene reducer owns current scene, selected object, undo-safe mutations, and persisted preferences.
- The SVG editor maps meters into a stable view box and renders walls, portals, sources, listener, selection handles, and later diagnostic paths.
- A persistent `AudioEngine` creates one graph per source after the explicit Start Audio action. Raw and simulated buses crossfade without restarting sources. The simulated direct path uses manual distance gain and `PannerNode` with `panningModel = "HRTF"`.
- Acoustic calculations move to a Worker in Gate B. The UI and audio contracts are shaped now so that worker frames can be applied later without graph rebuilds.

## Visual direction

Echo Canvas should feel like a compact field-acoustics workstation: cool mineral gray surfaces, a muted ultrasonic cyan for signal flow, amber for the listener, and coral only for destructive or blocked states. The primary canvas is the memorable element: a faint meter grid with animated-but-reduced-motion-safe wavefront rings around the selected source. Typography uses a readable grotesk for controls and a tabular monospace face for measurements. Layout is a wide three-zone instrument panel on desktop and a stacked canvas-first layout on narrow screens.

The signature element is the route/readout strip attached to the canvas edge: it describes the active source in human language and exposes distance, route, gain, and cutoff as aligned measurements. This directly supports the hackathon demo rather than decorating it.

## Data and validation

`SceneSpec` follows `schemas/scene-spec.schema.json` and `docs/API_CONTRACTS.md`. Runtime validation rejects unknown IDs, duplicate IDs, non-finite coordinates, invalid wall lengths, self-intersecting room polygons, invalid portal attachment, and hard-limit violations. Imports are atomic: an invalid payload never replaces the current valid scene.

## Failure behavior

- Audio never starts automatically and the interface clearly explains the required gesture.
- Missing audio assets or a suspended `AudioContext` produce actionable status text while editing remains available.
- Invalid edits are rejected locally and surfaced in the inspector.
- Invalid imports preserve the current scene.
- OpenAI is not required before Gate D; presets and manual editing always work offline.

## Testing

- Vitest covers domain types, registries, schema/domain validation, reducers, coordinate transforms, audio math, and persistent graph lifecycle using small Web Audio fakes at the boundary.
- Playwright covers the judge path: page load, preset selection, object dragging, wall editing, portal toggle, Start/Stop Audio, and Raw/Simulated mode.
- Every feature follows red-green-refactor. Generated configuration and static CSS are verified by build/lint/e2e rather than unit-tested as behavior.

## Frozen boundaries

The constraints in `AGENTS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, and `docs/ACOUSTICS.md` are binding. The app must never claim true diffraction, architectural accuracy, a named HRTF dataset, binaural deconvolution, or dry-source reconstruction.
