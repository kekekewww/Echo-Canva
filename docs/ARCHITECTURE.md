# Architecture

## Unified authoring workspace (2026-07-19)

The application now has a versioned authoring layer above both engine contracts:

```text
UnifiedWorkspace
  ├─ classic WorkspaceProject ─ projectClassicScene ─ Classic Worker / Web Audio
  ├─ hybrid WorkspaceProject  ─ projectHybridDocument ─ Hybrid Worker / Web Audio
  ├─ per-mode 50-command reversible-diff history and localStorage cache
  └─ browser-only IndexedDB local-audio library
```

`WorkspaceProject` owns the listener collection, active listener, authoring selection, disabled IDs, rectangular room dimensions/materials, source heights, finite wall/Portal settings, local-audio metadata, and per-mode camera/overlay/panel state. Projectors produce narrower, valid-by-construction `SceneSpec` or `SceneDocumentV2` views, omit disabled geometry and dependent Portals, and expose exactly one active listener to deterministic computation. External import, AI candidate, migration, and scene-replacement boundaries retain full Schema/domain validation; the hot internal Hybrid projection relies on reducer invariants instead of repeating those external-boundary checks for every pose selection.

The 3D viewport receives every enabled listener, source, wall, and Portal. Its path overlay is derived from the accepted Hybrid Worker frame and rejects stale revisions. Both modes apply a reversible virtual-pixel camera pan after projection; Classic reverses pan/zoom before world editing and Hybrid reverses it before fixed-height X/Z unprojection. Middle-button and Shift-empty panning, cursor-anchored wheel zoom, Home, and Frame All update only the per-mode view state. Camera orbit/pan/zoom, ceiling presentation, and path visibility never enter Undo/Redo, increment the acoustic revision, or change acoustic state. The persistent Web Audio graph receives smoothed parameters from the same accepted result.

Project cache keys are `echo-canvas:project:classic:v1`, `echo-canvas:project:hybrid:v1`, and `echo-canvas:workspace-ui:v1`. Cache document version `3.0` stores the current project plus at most 50 compact reversible patches in each history direction. Legacy camera records without pan migrate to `panX = 0` and `panY = 0`; legacy SceneSpec, SceneDocumentV2, and snapshot-history caches otherwise migrate purely. A failed migration keeps the unread record available for download and opens a safe preset. Local audio uses `echo-canvas-audio/assets` in IndexedDB and never crosses a server route; unavailable IndexedDB falls back to a declared memory-only library.

One `AudioEngine` belongs to `UnifiedWorkspace`, outside both mode adapters. A mode switch flushes the departing cache and updates the same graph; it does not construct another `AudioContext` or duplicate source graphs. Numeric pointer scrubbing begins a history transaction, updates the deterministic projection continuously, and commits one reversible patch on pointer release.

Hybrid patch/BVH caching uses a static-geometry fingerprint containing room surfaces, enabled wall/Portal geometry, materials, and vertical bounds. Listener/source poses, selection, presentation camera, and revision do not invalidate that structure. The Worker and main-thread fallback compiler rebind only pose data until the static fingerprint changes.

## Context diagram

```text
User
 │
 ├── manual canvas edits ─────────────────────────────┐
 │                                                    │
 └── natural-language prompt                          │
              │                                       │
              ▼                                       │
     Next.js server route                             │
     GPT-5.6 mode-aware Structured Output             │
              │ SceneSpec or {scene, spatial3d}        │
              ▼                                       │
     schema + invariant validator                     │
              │ validated authoring candidate         │
              └───────────────────────────────────────┤
                                                      ▼
                                            Client scene store
                                              │          │
                           geometry snapshot  │          │ UI render
                                              ▼          ▼
                                      Acoustic Web Worker Canvas/SVG
                                              │
                                      AcousticFrame @ 10–15 Hz
                                              │
                                              ▼
                                      Web Audio AudioEngine
                                direct / portal / ER / late reverb
                                              │
                                              ▼
                                            Headphones
```

## Component boundaries

### 1. Editor/UI

Responsibilities:

- render 2D world coordinates;
- edit walls, portals, source/listener positions, room height, and material presets;
- display routes, reflection paths, occluders, meters, and estimated RT60;
- manage Raw/Simulated and Start/Stop Audio;
- import/export JSON;
- never perform authoritative acoustic calculations.

Recommended implementation:

- SVG for MVP because hit-testing and debug paths are simple;
- React state plus a small reducer/store;
- convert screen/world coordinates in one utility module;
- coalesce drag changes before posting to the Worker.

### 2. Domain layer

Contains:

- `SceneSpec` types and schema;
- material/audio registries;
- invariant validation;
- migration by `schemaVersion`;
- pure unit conversion and serialization.

No React, Web Audio, Worker, or OpenAI dependencies.

### 3. Acoustic Worker

Input:

```ts
type AcousticWorkerRequest =
  | { type: "INIT"; scene: SceneSpec }
  | { type: "UPDATE_SCENE"; revision: number; scene: SceneSpec }
  | { type: "SET_DEBUG"; enabled: boolean };
```

Output:

```ts
type AcousticWorkerResponse =
  | { type: "FRAME"; revision: number; frame: AcousticFrame; metrics: WorkerMetrics }
  | { type: "ERROR"; revision?: number; code: string; message: string };
```

Responsibilities:

- build geometry indexes;
- determine direct visibility;
- accumulate occlusion;
- construct and query a portal visibility graph;
- compute first-order image-source candidates;
- estimate room volume, absorption, and three-band RT60;
- return stable scalar parameters and debug paths.

Authoritative update rate: 10–15 Hz. Ignore stale frames by `revision`.

### 4. Audio engine

Create a persistent graph after the user presses Start Audio.

Per source:

```text
AudioBufferSource/loop manager
   ├── Raw bus ───────────────────────────────┐
   └── Simulated pre-gain                     │
          │                                   │
       low-pass                               │
          │                                   │
       direct gain                            │
          │                                   │
       HRTF Panner ───────────────────────────┤
          │                                   │
          ├── early-reflection tap bank       │
          └── reverb send ── late reverb ─────┤
                                              ▼
                                       mode crossfader
                                              │
                                       master limiter
                                              │
                                         destination
```

Rules:

- source buffers may loop, but node bundles remain stable;
- use `setTargetAtTime` or linear ramps for parameters;
- update virtual panner position using direct source or first portal;
- create a fixed pool of six early-reflection taps per source;
- do not replace a `ConvolverNode` buffer every frame;
- use a native-node Schroeder network first;
- use `AudioWorklet` only if a later FDN is justified by failed listening tests.

### 5. AI control plane

#### Scene compiler

Endpoint:

`POST /api/scene/compile`

Input:

```json
{
  "prompt": "A small concrete room with an open east doorway...",
  "targetMode": "hybrid-3d",
  "baseScene": {}
}
```

Behavior:

1. authenticate the server-side OpenAI configuration;
2. normalize and length-limit text;
3. call GPT-5.6 with strict Structured Outputs;
4. validate JSON Schema;
5. validate domain constraints;
6. optionally call once more with machine-readable validation errors;
7. return a validated Classic `SceneSpec` or Hybrid `{scene, spatial3d}` candidate, or a deterministic fallback.

Classic output uses planar x/y. Hybrid output explicitly maps world X/Z to planar x/y and carries world Y in bounded Listener/source height and Wall/Portal vertical records. Applying a candidate replaces the active mode's room bounds, materials, positions, and vertical geometry in one history command; it never alters the other mode.

The prompt must expose only allowed:

- material IDs;
- audio clip IDs;
- source types;
- coordinate bounds;
- maximum object counts.

#### Acoustic explanation

Endpoint:

`POST /api/scene/explain`

Input includes a compact deterministic snapshot, never raw audio.

Output:

```json
{
  "summary": "...",
  "factors": [
    { "label": "Concrete obstruction", "evidence": "mid-band loss 18 dB" }
  ],
  "limitations": ["Portal routing is a perceptual approximation."]
}
```

### 6. Persistence

Implemented:

- independent versioned localStorage projects for 2.5D and 3D;
- camera, overlay, panel, selection, active listener, missing-audio and finite-geometry state;
- at most 50 compact reversible history commands per mode;
- 150 ms debounced save plus mode-switch and pagehide flush;
- authoring JSON transfer with local-asset metadata but no audio blobs;
- IndexedDB audio with stable-ID relink and in-memory fallback;
- safe-preset recovery with download of an unread cache record.

No database.

### 7. Deployment and failure modes

- deploy a Vercel-compatible build;
- keep all audio and preset data local to the app;
- when OpenAI is unavailable, manual editing and presets still work;
- show deterministic error states rather than empty UI;
- primary browsers: current desktop Chrome and Edge;
- Safari/Firefox are best-effort and must be documented honestly.

## Performance budgets

- 100 walls, 8 portals, 4 sources;
- 6 early-reflection taps per source;
- Worker p95 calculation under 12 ms on a typical laptop;
- no long task over 50 ms during normal dragging;
- no Web Audio node allocation during steady-state acoustic updates;
- no unbounded arrays or ray histories;
- UI remains responsive while audio runs.

## Suggested repository tree

```text
AGENTS.md
README.md
docs/
  PRD.md
  ARCHITECTURE.md
  ACOUSTICS.md
  API_CONTRACTS.md
  BUILD_CHECKLIST.md
  ACCEPTANCE_TESTS.md
  RESEARCH.md
  STATUS.md
  DECISION_LOG.md
schemas/
  scene-spec.schema.json
src/
  app/
    page.tsx
    api/scene/compile/route.ts
    api/scene/explain/route.ts
  components/
    editor/
    inspector/
    transport/
  domain/
    scene/
    materials/
    audio-assets/
  acoustics/
    geometry.ts
    spatial-index.ts
    occlusion.ts
    portal.ts
    image-source.ts
    room-acoustics.ts
    frame.ts
  audio/
    AudioEngine.ts
    SourceGraph.ts
    EarlyReflectionBank.ts
    SchroederReverb.ts
    parameter-smoothing.ts
  ai/
    scene-schema.ts
    prompts.ts
    validate-scene.ts
  workers/
    acoustics.worker.ts
tests/
  unit/
  fixtures/
  e2e/
public/
  audio/
```

## Primary data lifecycle

1. User changes the scene or GPT returns a candidate.
2. Domain validator emits an immutable, valid `SceneSpec` with a new revision.
3. UI renders immediately.
4. Worker receives a coalesced snapshot.
5. Worker returns `AcousticFrame`.
6. Client ignores frames older than the current revision.
7. Audio engine smoothly maps parameters to persistent nodes.
8. Debug UI displays the exact frame used by the audio engine.
9. Optional explanation endpoint summarizes the same snapshot.
