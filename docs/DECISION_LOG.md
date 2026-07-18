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
