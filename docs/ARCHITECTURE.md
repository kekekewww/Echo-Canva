# Architecture

## Unified authoring workspace (2026-07-19)

The application now has a versioned authoring layer above both engine contracts:

```text
UnifiedWorkspace
  ├─ classic WorkspaceProject ─ projectClassicScene ─ Classic source Worker pool / Web Audio
  ├─ hybrid WorkspaceProject  ─ projectHybridDocument ─ Hybrid source Worker pool / Web Audio
  ├─ per-mode 50-command reversible-diff history and localStorage cache
  └─ browser-only IndexedDB local-audio library
```

`WorkspaceProject` owns the listener collection, active listener, authoring selection, disabled IDs, rectangular room dimensions/materials, source heights, finite wall/Portal settings, bounded Box/Cylinder/Sphere acoustic primitives, local-audio metadata, and per-mode camera/overlay/panel state. Projectors produce narrower, valid-by-construction `SceneSpec` or `SceneDocumentV2` views, omit disabled geometry and dependent Portals, and expose exactly one active listener to deterministic computation. Classic projection converts enabled primitive footprints to synthetic full-height walls; Hybrid projection retains complete primitive records. External import, AI candidate, migration, and scene-replacement boundaries retain full Schema/domain validation; the hot internal Hybrid projection relies on reducer invariants instead of repeating those external-boundary checks for every pose selection.

The 3D viewport receives every enabled listener, source, wall, and Portal. Its path overlay is derived from the accepted Hybrid Worker frame and rejects stale revisions. Both modes apply a reversible virtual-pixel camera pan after projection; Classic reverses pan/zoom before world editing and Hybrid reverses it before fixed-height X/Z unprojection. Middle-button and Shift-empty panning, cursor-anchored wheel zoom, Home, and Frame All update only the per-mode view state. Camera orbit/pan/zoom, ceiling presentation, and path visibility never enter Undo/Redo, increment the acoustic revision, or change acoustic state. The persistent Web Audio graph receives smoothed parameters from the same accepted result.

Project cache keys are `echo-canvas:project:classic:v1`, `echo-canvas:project:hybrid:v1`, and `echo-canvas:workspace-ui:v1`. Cache document version `3.0` stores the current project plus at most 50 compact reversible patches in each history direction. Persistence is debounced until 2 s of idle time so synchronous localStorage serialization does not interrupt rapid Listener or transform interaction; mode changes and `pagehide` flush immediately. Legacy camera records without pan migrate to `panX = 0` and `panY = 0`; legacy SceneSpec, SceneDocumentV2, and snapshot-history caches otherwise migrate purely. A failed migration keeps the unread record available for download and opens a safe preset. Local audio uses `echo-canvas-audio/assets` in IndexedDB and never crosses a server route; unavailable IndexedDB falls back to a declared memory-only library.

One `AudioEngine` belongs to `UnifiedWorkspace`, outside both mode adapters. A mode switch flushes the departing cache and updates the same graph; it does not construct another `AudioContext` or duplicate source graphs. Numeric pointer scrubbing begins a history transaction, updates the deterministic projection continuously, and commits one reversible patch on pointer release.

Hybrid patch/BVH caching uses a static-geometry fingerprint containing room surfaces, enabled wall/Portal geometry, primitive facets, materials, and vertical bounds. Listener/source poses, selection, presentation camera, and revision do not invalidate that structure. Each persistent Hybrid source Worker owns a cloned cached BVH. Pose-only frames send compact Listener/source data; a static edit reinstalls the changed geometry in every active Worker before that Worker computes its assigned sources. The deterministic serial fallback uses the same static fingerprint and pose-rebinding boundary.

Each active mode has a main-thread coordinator and one to four persistent source Workers. Pool capacity is `min(4, max(1, floor(navigator.hardwareConcurrency) - 2))`, reserving two logical cores when possible; the active count for a completed frame is `min(sourceCount, capacity)`. A one-source scene therefore intentionally uses one active Worker. This is deterministic source sharding for bounded CPU work, not GPU acceleration or evidence of physical accuracy.

The coordinator coalesces updates at 10–15 Hz, assigns stable source-ID shards, and accepts a frame only after every assigned Worker returns a valid result for the same request, revision, static fingerprint, compatibility hash, and source assignment. Every static install has one expected acknowledgement per Worker; a missing, unexpected, or duplicate acknowledgement invalidates the pool. Each in-flight job has a configurable 2,000 ms default watchdog that is cancelled on completion, failure, or disposal. It merges shards atomically in deterministic source order and publishes pool wall latency, active Worker count, maximum shard compute time, total shard compute time, and the accepted request sequence. A constructor, protocol, message, timeout, or compute failure invalidates the whole pool: partial results are discarded, all pool Workers are terminated, and complete deterministic serial fallback takes over. The visible status is `Fallback`, and authoring remains usable.

Worker payloads are treated as untrusted structured-clone data. Classic validation limits IDs to the SceneSpec ID envelope, coordinates to a conservative ±100 m transport envelope, physical/effective distances to 150/1,600 m, route points to the source plus at most 100 ordered wall crossings plus the Listener, Portal/wall arrays to their 8/100 entity limits, low-pass to 20–20,000 Hz, early delay to 0–80 ms, and mixed first/second-order taps to six. It reconstructs direct/blocked traces, ordered occluders, the lowest-cost open-Portal route, listener-facing virtual position, gain/filter mapping, every unique visible first-order wall reflection, and every returned second-order wall pair with two specular points and three visible legs. Hybrid validation uses the installed geometry as the authoritative patch/surface/material registry, bounds coordinates to ±100 m, direct distance to 250 m, delay to 0–2,000 ms, and requires unit arrival/propagation directions plus route/hit consistency. It independently recomputes direct distance, delay, direction, azimuth/elevation, hit locations, first-order finite-patch specular paths, and every returned second-order surface pair with its two specular points and three visible BVH legs. The mixed audible result remains capped at six ranked taps. These transport bounds are deliberately wider than valid authored rooms while still rejecting finite but hostile payloads.

The status bar exposes the accepted acoustic revision and monotonically increasing request sequence as diagnostics. Active-Listener changes increment the acoustic revision even though ordinary selection remains presentation-only, preventing a complete frame for the prior Listener from satisfying a current Classic revision guard.

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
                                      Main-thread coordinator + 1–4 source Workers / Canvas/SVG
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
- edit walls, portals, Box/Cylinder/Sphere acoustic obstacles, source/listener positions, room height, and material presets;
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

### 3. Acoustic Worker pools

The Classic coordinator preserves the existing request/response facade shown below so consumers do not control individual shards. Hybrid uses an analogous internal pool contract and publishes one validated completed frame.

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

- keep one main-thread coordinator and one to four persistent source Workers for the active mode;
- reserve two logical cores when possible, cap each pool at four, and never activate more Workers than sources;
- source-shard direct visibility, occlusion, portal-graph routing, first-order candidates, and bounded blocked-route Hybrid second-order candidates;
- install and cache static geometry in each Worker, with compact pose-only updates between static edits;
- compute Classic room absorption and three-band RT60 once per frame outside per-source shards;
- validate request IDs, revisions, fingerprints, compatibility hashes, assigned source IDs, and result structure;
- atomically merge all shards in stable source order before publishing scalar parameters and debug paths;
- report wall latency, active Worker count, maximum shard time, and total shard time;
- discard partial work and activate complete deterministic serial fallback if any pool member fails.

Authoritative update rate: 10–15 Hz. The coordinator coalesces pending updates and ignores obsolete or stale frames. No partial pool frame reaches audio or overlays.

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
- create a fixed pool of six ranked first/second-order early-reflection taps per source;
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

Classic output uses planar x/y. Hybrid output explicitly maps world X/Z to planar x/y, carries world Y in bounded Listener/source height and Wall/Portal vertical records, and may include up to eight validated acoustic primitives. Applying a candidate replaces the active mode's room bounds, materials, positions, vertical geometry, and primitive collection in one history command; it never alters the other mode.

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
- when a Worker pool is unavailable, complete deterministic serial fallback keeps the matching acoustic frame, audio, overlays, and authoring available while the UI reports `Fallback`;
- show deterministic error states rather than empty UI;
- primary browsers: current desktop Chrome and Edge;
- Safari/Firefox are best-effort and must be documented honestly.

## Performance budgets

- 100 walls, 8 portals, 4 sources;
- 6 early-reflection taps per source;
- 1–4 persistent source Workers per active mode, capped at four and reserving two logical cores when possible;
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
4. The active mode's coordinator receives a coalesced snapshot and shards its sources across one to four persistent Workers.
5. The coordinator validates every shard and atomically returns one matching `AcousticFrame`; any pool failure produces the complete deterministic serial fallback instead.
6. Client ignores frames older than the current revision.
7. Audio engine smoothly maps parameters to persistent nodes.
8. Debug UI displays the exact frame used by the audio engine.
9. Optional explanation endpoint summarizes the same snapshot.
