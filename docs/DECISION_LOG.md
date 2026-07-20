# Decision Log

## D-051 — Treat Worker responses as bounded untrusted protocol data

Decision (2026-07-21): Require one expected static-install acknowledgement from each assigned Worker, reject unexpected or duplicate acknowledgements, and guard each Classic/Hybrid job with a configurable watchdog whose browser default is 2,000 ms. Validate finite Worker payloads against route semantics, installed IDs/materials, entity-derived array limits, conservative coordinate/distance/delay/filter/gain envelopes, and normalized Hybrid direction vectors before atomic merge. Expose the accepted acoustic revision/request sequence so browser evidence can associate every timing sample with a distinct complete frame. Active-Listener changes now increment the acoustic revision. Classic relative reflection delay is clamped to zero when a Portal-aware direct route is longer than the reflected arrival.

Reason: A Worker can remain silent without triggering `error`, and structured-clone payloads can be finite yet semantically hostile. Either case previously allowed an in-flight job to stall forever or malformed values to reach audio/overlays. Request-sequence evidence also prevents a stale status-bar timing from being sampled repeatedly as if it were 24 completed interactions. Conservative transport envelopes are intentionally wider than the authored 50 m room limits; they are protocol safety bounds, not new physical-accuracy claims.

## D-050 — Shard bounded source work across persistent Worker pools

Decision (2026-07-21): Replace the single-Worker execution model in both Classic and Hybrid modes with a main-thread coordinator and one to four persistent source Workers. Capacity is capped at four and reserves two logical cores when possible; active count is also capped by source count, so a one-source scene intentionally uses one Worker. Shards merge atomically only after revision, fingerprint, compatibility, assignment, and response validation. Any pool failure discards partial work and activates complete deterministic serial fallback, reported visibly as `Fallback`. This decision supersedes D-046's stopped-simulation policy.

Reason: Direct/Portal/first-order per-source work is independent and deterministic, so source sharding reduces bounded four-source wall latency without changing acoustic formulas or expanding to higher-order reflections. Persistent Workers amortize startup and static compilation. The tradeoffs are up to four cloned static caches (including one cached BVH per Hybrid Worker), coordination/validation overhead, and no speedup for the intentionally single-Worker one-source case. This is CPU source sharding, not GPU acceleration or a claim of physical accuracy.

## D-049 — Add bounded faceted acoustic primitives after owner approval

Decision: Add at most eight authorable Box, Cylinder, or Sphere acoustic primitives. Classic
projects compile each enabled shape to a full-height planar footprint; Hybrid projects compile a
Box to six finite patches, a Cylinder to twelve side patches plus two caps, and a Sphere to a
fixed 8-by-4 faceted surface. Every shape has finite XYZ position and dimensions, Y rotation, a
registered perceptually tuned material, persistence, import/export, reversible Disable, direct
selection, and one-command deletion. GPT Hybrid output may include the same bounded records.

Reason: The owner explicitly expanded the accepted authoring scope beyond walls after the unified
2.5D/3D gates passed. Fixed topology preserves deterministic BVH cost and strict validation while
providing useful obstacle volumes without accepting arbitrary meshes or claiming full geometric
or wave-acoustic accuracy. Cylinder and Sphere controls explicitly disclose the faceted acoustic
approximation.

## D-048 — Separate specular early-reflection energy from scattering

Decision: First-order image-source taps use only the specular share of reflected energy, `rho * (1 - scattering)`, in both Classic and Hybrid rendering. Retune the perceptually tuned Acoustic Treatment preset so its Mid/High specular energy remains at or below 5%/2% respectively. Diffuse energy remains available to the experimental receiver/late-field path and is not duplicated into the discrete tap bank.

Reason: Human Gate E found strong transient reflections still prominent after every wall was changed to Acoustic Treatment. The material registry already carried a scattering coefficient, and the six-band energy model already split reflected energy into specular and diffuse shares, but the production first-order tap renderers incorrectly used total reflected energy as a fully coherent mirror reflection. The tighter treatment preset creates an audible authoring contrast without claiming anechoic or architectural accuracy.

## D-047 — Compile and apply mode-aware AI authoring candidates

Decision: Keep Classic generation as a strict `SceneSpec`, but require Hybrid generation to return `{scene, spatial3d}`. The planar scene maps world X/Z to scene x/y; the companion record covers every generated Listener/source/Wall/Portal height by ID. Applying either candidate atomically synchronizes the selected mode's room dimensions and materials; applying Hybrid also replaces its vertical geometry.

Reason: Sending a 3D prompt through the legacy planar schema discarded Z, interpreted Y as floor-plan depth, and retained the previous 12 × 8 × 3 m authoring room. A separate strict Hybrid contract preserves user intent without allowing GPT to calculate acoustics or directly control the runtime engine.

## D-043 — Persist compact reversible authoring patches

Decision: Cache the current project plus at most 50 reversible value/splice patches in each history direction. Coalesce a continuous numeric pointer scrub into one transaction. Migrate the earlier snapshot-history envelope to patches without overwriting the original record on failure.

Reason: Fifty complete 100-Wall scene snapshots can exhaust localStorage. Structural patches keep ordinary transforms, material changes, enable state, and listener activation small while retaining Undo/Redo across refresh.

## D-044 — Preserve missing local-audio identity and metadata

Decision: Authoring JSON contains local asset ID, name, MIME type, size, and creation time, but never the blob. An unavailable asset leaves its Source silent and fixed in place; relink replaces the IndexedDB record under the same ID. IndexedDB failure declares memory-only operation.

Reason: Scene sharing must not upload private audio or silently delete authoring intent. Stable IDs let the audio graph and Source transform survive removal, transfer, and recovery.

## D-045 — Compile complete finite Wall and Portal solids

Decision: Hybrid walls compile front/back panels plus top, bottom, and end caps. An open Portal carves a passage through the full wall depth and adds jamb/header/sill surfaces; a closed Portal adds a finite barrier slab using authored thickness. Inspector offset is converted to the planar center along the finite host wall.

Reason: A front-face-only opening looked and behaved like a column rather than a wall. Closed/open states and first-order surface candidates must describe the same finite authoring geometry.

## D-046 — Stop active simulation when its Worker is unavailable

Superseded by D-050 on 2026-07-21. Worker-pool denial now activates complete deterministic serial fallback and reports `Fallback`.

Decision: The deterministic hook may compute an internal main-thread diagnostic fallback, but the workspace adapter does not send fallback frames to audio or path overlays. It reports `Stopped · Worker unavailable`; authoring and the other mode remain usable.

Reason: A failure must not present an unscheduled main-thread approximation as the accepted Worker frame. This preserves project access and makes the degraded state explicit without blocking manual edits.

## D-041 — Introduce a versioned authoring layer above both deterministic engines

Decision: Keep independent 2.5D and 3D `WorkspaceProject` documents above the existing `SceneSpec` and `SceneDocumentV2` contracts. Projectors select the active listener, filter disabled entities, apply finite 3D wall/Portal bounds, and then invoke the existing deterministic workers. A single modelling-style shell owns selection, Inspector edits, local caches, history, and Reset.

Reason: The requested game-engine interaction model requires multiple authoring listeners, local sources, reversible disable state, and independent modes, while the validated acoustic engines intentionally accept narrower contracts. The authoring layer adds those workflows without allowing UI or GPT output to become an acoustic solver. The Hybrid viewport consumes the same accepted Worker revision as audio, so generalized 3D visualization does not introduce a second ray solver.

## D-042 — Render all enabled finite 3D authoring geometry

Decision: Replace the fixed Radio/Rain/partition viewport model with data-driven listener, source, wall, and Portal collections. Render wall thickness as paired finite faces, carve open Portals using their own bottom/top bounds, expose wall endpoints and Portal centres as direct-manipulation handles, and omit disabled entities.

Reason: A fixed fixture contradicted the new Add, Disable, and finite-dimension authoring commands. Generalized viewport data makes visual selection, Inspector values, deterministic compilation, and cached authoring state describe the same objects while retaining a rectangular room shell and first-order acoustic boundary.

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

## D-039 ??Make the selected 3D object the control-system anchor

Decision: Treat selection as a visual and instructional state in the Hybrid Lab. A direct drag
selects its Listener, source, wall endpoint, or Portal; the scene marker, selected-object card,
and corresponding control group use the same semantic colour and language. Retain all existing
precision controls rather than replacing them with a hidden contextual inspector.

Reason: The tester could move 3D objects but could not reliably tell which numeric controls
described the manipulated object. A visible selection bridge makes the 3D viewport teach the
control rack while preserving keyboard access, testability, and the established direct-manipulation
workflow.

## D-040 ??Use a modelling-workbench hierarchy instead of a persistent control wall

Decision: Add a compact scene Outliner and make the current scene selection determine which
Transform or barrier controls remain visible. Convert repeated prose into short interaction cards,
while retaining all selected precision controls, the direct-manipulation viewport, and an explicit
collapsed environment-preview card.

Reason: The prior selection bridge explained what was selected but still required scanning every
unrelated slider. A game-engine-oriented workbench needs scene navigation, an active object, and a
contextual inspector so object manipulation and exact values are one coherent operation. The
environment card remains intentionally preview-only and states that it does not alter Browser HRTF
rendering, preventing the more compact UI from obscuring a model boundary.

## D-041 — Persist modelling-style viewport navigation as presentation state

Decision: Add finite virtual-pixel `panX` / `panY` to each mode's cached camera. Both viewports use middle-button drag and Shift-left on empty space for panning, cursor-anchored wheel zoom, Home, and deterministic Frame All. Hybrid keeps ordinary empty-space orbit and Shift-object Y editing; middle-button panning takes priority even when initiated over an authored object. Legacy camera caches receive zero pan.

Reason: Large generated or manually resized scenes can exceed the fixed viewport and become difficult to edit. A reversible projection/inverse-projection pair keeps visible geometry, pointer coordinates, and Wall placement aligned while treating navigation as presentation-only state outside acoustic revisions and Undo/Redo.

## D-042 — Reconcile the legacy MVP submission package with the accepted release candidate

Decision: Use `echo-canvas-mvp-submission/` as a release-process checklist and evidence template, but update its 2D-only scope, Devpost copy, demo script, and limitations to describe the currently verified unified 2.5D/Hybrid 3D workbench. Do not remove accepted 3D authoring, vertical geometry, listener/source management, or first-order floor/ceiling/wall path overlays. Keep deployment, public video upload, Devpost submission, and the final `/feedback` identifier as explicit external owner gates.

Reason: The supplied package is a snapshot from before the owner explicitly approved the 3D extension and unified modelling-workspace work. Following its old exclusion list literally would roll back tested product functionality and make the submission copy disagree with the executable application. Treating it as a bounded release checklist preserves its useful security, evidence, and acceptance structure while keeping all public claims aligned with observable behavior.

## D-043 — Cache Hybrid static geometry independently from receiver/source poses

Decision: Fingerprint Hybrid static geometry from room surfaces, enabled wall/Portal geometry, materials, and vertical bounds rather than the full Classic projection hash. Reuse that patch/BVH structure in both the Worker and the main-thread fallback compiler when only Listener/source poses change. Build the hot `projectHybridDocument` directly from the already-invariant-preserving workspace state, while retaining complete Schema/domain validation at all external import, AI candidate, persistence migration, and scene-replacement boundaries.

Reason: Final 100-wall verification exposed a 16 ms Worker p95 sample and 50–206 ms main-thread tasks while switching active listeners. The full compatibility hash includes Listener/source poses and revision, so it invalidated a cache whose contents do not depend on those fields; the React fallback path also cloned and validated the same 100-wall document repeatedly. A pose-independent static fingerprint preserves geometry correctness, keeps external data validation unchanged, and removes redundant BVH construction and hot-render validation rather than weakening the established 12 ms / 50 ms budgets.
