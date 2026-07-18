# Decision Log

## D-001 — Browser-first delivery

Decision: Use a deployed Web Audio application instead of Godot/OpenAL for the hackathon MVP.

Reason: A browser demo minimizes judge setup and submission risk while preserving the core spatial-audio experience.

## D-002 — Deterministic acoustics, AI control plane

Decision: GPT-5.6 compiles intent and explains results; deterministic code computes acoustic parameters.

Reason: Testability, credibility, reproducibility, and clear judging evidence.

## D-003 — Exclude arbitrary binaural de-spatialization

Decision: Accept curated mono point-source assets.

Reason: The inverse problem is underdetermined without strong assumptions and is not a responsible hackathon promise.

## D-004 — Portal routing, not diffraction

Decision: Use explicit opening nodes and a visibility graph.

Reason: True edge diffraction is out of scope and much more complex than ray redirection.

## D-005 — Hybrid reverb

Decision: First-order image-source early reflections plus algorithmic late reverberation.

Reason: Better stability and plausibility than estimating an entire late field from a few per-frame rays.

## D-006 — Schroeder before FDN

Decision: Native-node Schroeder reverb is the MVP; FDN is conditional.

Reason: Lower implementation risk and easier browser compatibility.

## D-007 — Pinned bootstrap toolchain and build allowlist

Decision: Lock the Gate A bootstrap to concrete package versions and permit install scripts only for the transitive `sharp` and `unrs-resolver` packages in `pnpm-workspace.yaml`. TypeScript 5.9 and ESLint 9 remain pinned within the peer ranges of the Next.js lint stack.

Reason: Reproducible installs and an explicit native-build policy reduce supply-chain and integration drift while preserving a warning-free lint toolchain.

## D-008 — Preserve scene identity when editor mutations are rejected

Decision: A rejected editor mutation may return a new `EditorState` only to carry actionable rejection metadata. The previous valid `scene` object and all scene data retain exact identity; the next successful scene edit clears the rejection. Exact whole-state identity is therefore not an invariant for rejected mutations.

Reason: Silent rejection hides validation failures from keyboard, pointer, and assistive-technology users. Separating transient UI metadata from the validated scene preserves atomic scene updates while supporting an `aria-live` notice.

## D-009 — Observe external AudioContext state in Gate B

Decision: Treat browser device changes and externally initiated `AudioContext` interruption/state transitions as a non-blocking Gate B follow-up. Gate A owns explicit Start, Stop, resume, and error lifecycle only.

Reason: The current persistent graph correctly handles application-controlled lifecycle, while reliable external interruption reporting requires context state observation and browser-specific acceptance coverage. Gate A documentation must not imply that behavior is already observed.

## D-010 — Browser acceptance runs against the production server

Decision: `pnpm e2e` builds the application and Playwright launches a fresh `next start`; it never reuses an existing server on port 3000.

Reason: The 100-wall interaction budget describes the judge-facing production candidate. React and Turbopack development instrumentation added 68–83 ms to the measured DOM update, while the same unchanged implementation stayed under 50 ms in three consecutive production-server runs. Testing the optimized artifact removes development-only noise without relaxing the acceptance threshold.

## D-011 — Direct-trace endpoint and thin-wall loss policy

Decision: A finite segment intersection exactly at the source or listener is retained by the low-level predicate but excluded from direct-trace crossings; only intervening interior contacts can occlude. Per-wall adjusted transmission loss is floored at 0 dB in each band before accumulation, while the accumulated diagnostic loss remains otherwise uncapped.

Reason: Sources and listeners may be placed on a supporting room boundary, which is not an intervening obstruction. A material transmission-loss heuristic must never become a gain for schema-valid thin walls. The per-band 0 dB floor preserves a physically meaningful diagnostic, and keeping the accumulated value uncapped still exposes all attenuation before the separate 24 dB render cap.

## D-012 — Gate B portal E2E uses a genuinely blocked direct path

Decision: Move the canonical listener from `(3, 4)` to approximately `(3, 2)` in the Gate B browser scenario before asserting an open-portal route, then close the portal and assert the blocked fallback.

Reason: The original Task 4 script expected a portal route for the default Radio `(9, 4)` to listener `(3, 4)` path. That segment passes through the open door centered at `(6, 4)`, which the established direct-path contract correctly treats as direct visibility. Moving the listener below the 1.2 m opening creates the intended blocked direct path while retaining the tested, truthful direct-through-open-door behavior. This is the actual Gate B perception case: open portal routing versus closed-portal obstruction.

## D-013 ??Gate C diagnostics are frame-authoritative and explicitly limited

Decision: Display Eyring RT60, room surface/volume, pre-delay, first-order reflection count, and reflection paths only when the `AcousticFrame.revision` matches the current `SceneSpec.revision`. Label the values as an interactive acoustic approximation, not measurement data.

Reason: A Worker result for an earlier drag or preset must never be mistaken for the sound currently rendered. The Gate C candidate intentionally keeps curated continuous-loop sources and does not introduce an outer-room resize control or a one-shot impulse audition outside the frozen scope; those manual observations are documented as limitations while deterministic room-scale behavior remains unit-tested.

## D-010 — Browser-rendered Gate C audio validation

Decision: Keep the live product's curated continuous loops, but expose a test-only browser hook that renders the actual `SchroederReverb` implementation and shared Raw/Simulated crossfade through `OfflineAudioContext` during production Playwright tests.

Reason: Node-mock topology tests cannot establish output finiteness, peak safety, decay behavior, or sample continuity. The hook is not part of the interactive audio path; it provides reproducible rendered-buffer evidence without adding a user-facing impulse control outside the frozen scope.

## D-014 — Snapshot-bounded acoustic explanation

Decision: Send GPT-5.6 only a finite, compact acoustic projection and reject any structured explanation whose displayed numeric tokens do not equal one of the projected values. Always append the fixed portal-routing limitation.

Reason: The model is a prose-only control-plane component. Snapshot-bounded input and output validation make deterministic engine values authoritative while preventing fabricated measurements, hearing claims, and unsupported physical-accuracy claims.

## D-015 — Route-complete failures and source-bound explanations

Decision: Publish every compile route failure code through one client-parsed `CompileSceneResponse` union, and bind explanation state to source ID, scene revision, and a monotonically increasing request nonce. Keep developer instructions static; send scene/source labels, snapshot values, and repair errors only as untrusted user data.

Reason: An outage, timeout, refusal, or rate limit must retain the server's actionable fallback rather than becoming a generic client failure. Source/revision/nonce binding prevents a late explanation from appearing for a different selection. Separating model policy from untrusted content closes prompt-role injection paths; server-side text validation rejects links, markup, executable protocols, and instruction-like content before React displays it.

## D-016 — Opt-in OpenRouter Luna test provider

Decision: Keep the canonical OpenAI Responses API configuration as the default, while allowing a server-only, explicitly selected OpenRouter provider that uses the fixed `openai/gpt-5.6-luna` model ID.

Reason: The owner has an OpenRouter API key but no OpenAI Platform key. OpenRouter documents a Responses-compatible beta endpoint, so the adapter enables live Gate D testing without exposing a key to the browser. The adapter remains opt-in because it is a beta compatibility layer; the no-key fallback and all deterministic acoustic paths remain unchanged.

## D-017 — Validated browser JSON transfer

Decision: Export the current validated `SceneSpec` as a browser download and import only through the existing serialization parser and editor reducer.

Reason: The transfer controls need no server, account, or new storage. Reusing `parseScene` preserves schema-version migration and domain validation, while `REPLACE_SCENE` keeps imports atomic and gives the worker/audio graph a fresh revision.

## D-018 ??Additive Hybrid 3D programme with immutable Classic baseline

Decision: Proceed with the user-authorized Hybrid 3D extension as a phased programme, but freeze the existing `classic-2d5d` behavior behind the annotated `v0.1.0-mvp-baseline` tag and a deterministic ten-scenario regression artifact before introducing scene-v2 data, engine routing, or 3D geometry.

Reason: Analytic 3D formulas validate individual solvers, not their integration with the existing worker, Web Audio graph, v1 scene contract, or interaction performance. The immutable Classic baseline makes the extension additive, supplies a reliable rollback target, and prevents a feature-flagged Hybrid failure from degrading the validated MVP.

## D-019 ??Versioned scene envelope and gated engine router

Decision: Keep `SceneSpec v1` as the Classic data contract and introduce Hybrid data only in a strict `SceneDocumentV2` envelope containing an immutable-compatible `baseScene`, optional extensions, and a deterministic Classic projection hash. Route Hybrid selection through an owning engine router whose default and fallback is Classic.

Reason: The envelope enables 3D metadata without changing existing editor, AI, import/export, worker, or Web Audio consumers. Exact Classic projection and explicit disabled/uninstalled fallbacks make the future engine switch reversible rather than a risky global migration.

## D-020 ??Finite-patch Hybrid direct propagation with persistent HRTF adapter

Decision: Implement P2 as a Lab-only 3D direct-path solver over finite extruded floor, ceiling, and wall patches with explicit portal openings, a cached static BVH, and a persistent-node X/Y/Z Browser HRTF adapter. Keep Classic as the default route and leave Classic reflection/reverb untouched.

Reason: A finite-patch direct solver gives testable distance, delay, azimuth, elevation, doorway visibility, and panner behavior before adding the much riskier 3D reflection or late-field models. Caching only static geometry prevents pose edits from becoming a main-thread rebuilding cost, while the isolated Lab makes rollback immediate.

## D-021 ??Finite-patch validation before 3D reflection audio

Decision: Add first-order Hybrid Image Source geometry to the Worker only after finite-polygon containment, physical-wall deduplication, and both-leg visibility checks pass analytic tests. Do not yet route those paths into the audible early-reflection bank.

Reason: A visually plausible mirror point can still be outside the actual patch or hidden behind a second surface. Keeping the solver diagnostic-only until its deterministic path contract is proven avoids audible false reflections and preserves the current Classic reverb fallback.

## D-022 ??Expose Hybrid plan positions before judging horizontal HRTF

Decision: The Hybrid Lab must expose direct controls for Listener, Radio, and Rain plan `X`/`Z` positions, while retaining the separate `Y` elevation controls and the same fixed persistent HRTF graph.

Reason: The initial Lab exposed only height. Its default sources were both placed to the listener's right, so a tester could observe elevation but could neither create a left/centre/right comparison nor distinguish a coordinate-mapping defect from a fixed scene layout. Explicit plan controls make the coordinate contract testable without modifying the validated Classic editor or rebuilding audio nodes.

## D-023 ??Material-aware fixed-bank rendering for Hybrid first-order reflections

Decision: Render only Worker-validated first-order Hybrid paths through the existing six-tap early-reflection bank. Derive each tap's mid-band amplitude from the built-in material energy balance and its low-pass from the high-to-mid reflection-amplitude ratio; update persistent delay, gain, filter, and 3D panner parameters with the standard smoothing.

Reason: The established three-band registry is sufficient to make hard versus treated early reflections audibly distinct without prematurely claiming a six-band material or air-propagation model. Reusing the fixed bank prevents audio-node churn and preserves the validated Classic graph; path ordering and the six-tap cap make overload deterministic.

## D-024 ??Keep second-order reflection work oracle-gated and disabled

Decision: Add an exhaustive second-order ISM oracle only for scenes with at most 32 representative patches, plus a deterministic pruned-ISM candidate that reports comparison metrics and work statistics. Keep `secondOrderReflections` default-off and do not route its paths to the audio graph.

Reason: Second-order finite-patch paths require ordered surfaces and three visibility legs, so an apparently plausible path can still be invalid. The analytic and 32-patch fixtures establish a stable reference and deterministic pruning behavior, but pair-work reduction is not a hardware CPU benchmark and no Beam comparison has been made. Keeping the branch isolated prevents unmeasured higher-order energy from displacing the validated six first-order audible taps.

## D-025 ??Use deterministic Fibonacci receiver connections before stochastic late rendering

Decision: Introduce a Fibonacci sphere sampler with progressive golden-angle rotation, finite nearest-hit BVH tracing, visible receiver connections, and a scene-signature-reset energy accumulator. Keep it data-only and separate from the P3 specular tap bank.

Reason: Low-discrepancy deterministic samples make direction coverage, visibility, and accumulator reset reproducible in unit tests. A stochastic or late-audio path would introduce variance, convergence, and perceptual stability questions before a measured comparison exists, so it remains deferred rather than silently affecting the current reverb.

## D-026 ??Measure the 100-wall production interaction budget without browser contention

Decision: Run the production Playwright suite with one browser worker instead of sixteen concurrent browser processes.

Reason: The 50 ms selection and keyboard-edit budget represents one judge-facing production session. A full-suite parallel run can saturate the host and delay a DOM mutation without changing the product implementation; the focused test passed immediately. One worker keeps the integration suite reproducible and preserves the original 50 ms threshold instead of weakening or skipping it.

## D-027 ??Normalize P5 stationary energy by emitted directions

Decision: The P5 stationary receiver-connection benchmark reports mid-band energy per emitted
Fibonacci direction, as well as connection rate, CV, and p95 frame-to-frame energy delta.

Reason: Averaging only accepted receiver connections hides missed rays and makes a narrow opening
look artificially stable. Direction-normalized energy preserves that loss in the convergence
signal. This is an instrumented deterministic baseline, not evidence that the planned late-field
thresholds or a renderable diffuse tail have been achieved.

## D-028 ??Keep P6 six-band and atmosphere helpers Hybrid-only and default-off

Decision: Derive a six-band Hybrid projection from the immutable Classic three-band material
registry using log-frequency interpolation, and provide bounded pure atmosphere helpers without
changing Classic propagation or routing any result into audio.

Reason: The v1 registry and `343 m/s` Classic solver are part of the validated baseline. A
separate data-only projection preserves exact compatibility while giving P6 a testable energy and
medium contract before any six-band renderer, humidity UI, or air-absorption feature flag is
considered.

## D-029 ??Give Hybrid X/Z pose editing a plan-map control rather than only sliders

Decision: Add a constrained, draggable 2.5D map to the Hybrid Lab for Listener, Radio, and Rain
positions. Retain the numeric X/Z controls for precision and keyboard accessibility; keep Y as a
separate elevation control and leave wall/portal editing in Classic.

Reason: The Lab's original sliders made the coordinate contract testable but did not make spatial
relationships immediately legible. A minimal map directly connects a drag direction to the
resulting HRTF position while avoiding a second, divergent scene-editor implementation.

## D-030 ??Make P7 directional late data histogram-first and renderer-free

Decision: Bin validated P5 receiver connections into deterministic Fibonacci direction and delay
cells, preserving energy/count accounting and an energy-weighted centroid before allocating any
late-field virtual sources.

Reason: A directional late renderer must be judged on energy, timing, source count, head-motion,
and continuity. The histogram is a small deterministic contract that can be tested independently;
feeding unmeasured connection samples into the current audio graph would make the late field
audibly unstable without establishing whether its directional data are valid.

## D-031 ??Expose Hybrid elevation and atmosphere as bounded, honest controls

Decision: Add a pointer-draggable Y elevation map beside the existing X/Z plan map, and expose
temperature, relative humidity, and pressure as a P6 calculation preview. Keep the atmosphere
preview out of the direct, HRTF, reflection, and audio paths.

Reason: The Hybrid coordinate contract was not testable through a slider alone, and the existing
P6 medium model was invisible to a tester. A visual Y control makes all three pose axes directly
manipulable. The medium panel gives the air model an inspectable, bounded interface without
misrepresenting an unvalidated audio integration as an audible effect.

## D-032 ??Organize the Hybrid Lab around an audition workflow

Decision: Restructure the Lab UI into one audition deck, paired X/Z and Y drafting surfaces, a
separate precision-control rack, and a final path-state panel. Keep every existing data contract,
audio node, feature boundary, and Classic page unchanged.

Reason: The previous serial stack made a user discover one control at a time and obscured the
relationship between position, elevation, media preview, and resulting path diagnostics. The new
workbench gives spatial-audio prototyping a clear operating sequence while remaining an isolated,
reversible presentation change rather than an acoustic-engine rewrite.

## D-033 ??Use a dependency-free orthographic viewport for Hybrid pose control

Decision: Add an SVG orthographic viewport with tested projection and fixed-height unprojection,
camera orbit/zoom, object dragging, XYZ gizmo, and an explicit `+Z` north convention. Retain the
numeric and orthographic controls as precision/keyboard alternatives.

Reason: The Lab needs a direct-manipulation 3D scene interaction without giving a visual camera
authority over acoustic calculations or adding a renderer/runtime dependency. Orthographic math
keeps object dragging exactly invertible on a fixed-height plane, while camera orbit remains a
purely presentational view state.

## D-034 ??Treat the Portal as a wall opening, not a line artifact

Decision: Render the fixed Hybrid partition as filled wall panels on either side of an open Portal,
or one continuous panel when closed. Give the viewport a native non-passive wheel handler and
permit full yaw plus above/below orbit presentation angles.

Reason: A line-only partition was visually indistinguishable from a column and made the Portal
state unclear. Viewport wheel events must not scroll the page during a 3D editing gesture. The
camera remains visual-only; the intentionally fixed wall geometry will be made directly editable
only in a separate, tested scene-authoring scope.

## D-035 ??Route Hybrid direct-path results through the persistent acoustic controls

Decision: Keep the Hybrid finite-patch 3D solver authoritative for direct visibility, 3D distance,
and blocked-wall detection. When that solver reports a blocked path, reuse the already-validated
2D portal visibility graph only as a portal-aware routing approximation: it selects the
listener-facing opening in X/Z, which is lifted to the opening's 3D centre for Browser HRTF
rendering. Apply the resulting route gain, low-pass, virtual position, and effective distance to
the existing persistent source graph through parameter smoothing.

Reason: The Hybrid Lab previously sent pose coordinates to the panner but never applied an
occlusion or portal-route render state, so moving through a wall had no audible consequence. This
composition preserves finite-patch vertical doorway visibility, avoids claiming wave diffraction,
does not create audio nodes per update, and provides a tested migration path before a full 3D
visibility-graph solver is warranted.

## D-036 ??Make the Hybrid partition editable before adding general 3D authoring

Decision: Promote the Lab's central partition and its attached Portal from hard-coded presentation
geometry to one validated, directly editable scene fixture. Expose endpoint handles and a Portal
centre handle in the 3D viewport, plus compact precision controls for the same wall, Portal, and
material values. Each edit rebuilds only the Hybrid static geometry needed for that changed wall
and continues through the existing document validation, direct solver, and audible route path.

Reason: A fixed visual wall prevents the Lab from testing the core authoring-to-audio loop the
product promises. Starting with one bounded partition preserves the room shell, Classic editor,
and scene limits while proving direct 3D manipulation, Portal attachment, and material changes
before considering multi-wall create/delete/rotation tooling.

## D-037 ??Preserve exact Portal attachment on angled editable walls

Decision: Keep the Portal centre at full projected precision whenever an endpoint moves; round
only values that are true display or bounded-control values, such as rendered labels and Portal
width/height.

Reason: Rounding the projected centre to 0.1 m moves it microscopically off a sloped host wall.
The shared V1 SceneSpec validator correctly rejects that detached Portal, causing an otherwise
valid Hybrid edit to fail document serialization. Exact projection preserves the existing
validator contract without loosening its geometry guarantees.

## D-038 ??Preserve perceptible material contrast for blocked Hybrid direct paths

Decision: Raise the Hybrid blocked-direct safety cap from `-24 dB` to `-36 dB` and expose the
post-mapping gain/low-pass values in diagnostics. Keep the direct and Portal routes material-free
because no wall transmission is being approximated on those routes.

Reason: The former cap flattened Hard Concrete and Medium Wood to the same gain, masking a
correctly propagated material change from both the tester and the Browser HRTF graph. A `-36 dB`
bound remains finite and safe while retaining the difference prescribed by the existing material
registry. This is a perceptual mapping repair, not a claim of architectural-acoustics accuracy.
