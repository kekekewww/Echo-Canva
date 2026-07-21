# Codex Usage Evidence

## Principal workflow

Codex acted as the implementation and release agent inside one long-lived repository workflow. It read the repository-level `AGENTS.md`, maintained architecture/acceptance/status documentation, implemented bounded vertical slices, added regression tests, ran the quality gates, and committed traceable changes. The owner supplied product direction and performed the required perceptual/UI acceptance gates.

The final `/feedback` Session ID is intentionally not invented here. It must be obtained from the principal Codex task and entered into the submission by the owner.

## Traceable implementation areas

| Area | Representative commits | Verification |
|---|---|---|
| Typed scene contracts and editor | `b254c8a`, `c5d805f`, `968c7ce` | schema, geometry, editor reducer, production interaction tests |
| Persistent browser HRTF graph | `e1cba00`, `c63783d`, `19d3e2f` | lifecycle, panner, crossfade and browser tests |
| Direct occlusion and Worker frames | `8287ef5`, `72af03a`, `47cee3a` | deterministic intersections, stale revision, coalescing |
| Portal-aware propagation | `38e5f75`, `31c3884`, `36f5a31` | graph/routing units plus visible/audible production flow |
| Early reflections and reverb | `93b555a`, `562ff04`, `3284bf7`, `fb6f170` | image-source, RT60, Schroeder and OfflineAudioContext checks |
| GPT-5.6 control plane | `586f878`, `96cf885`, `827504b`, `ee9fded` | schema/domain/adversarial/fallback/grounding suites |
| Hybrid 3D foundations | `5ed6682` through `fde7c0f` | compatibility, direct/first-/second-order evaluation, material and late-field contracts |
| Direct-manipulation 3D lab | `d44c56a`, `0684b9c`, `ef6e005`, `4a74110` | viewport math, audible route, wall/Portal and selection tests |
| Unified modelling workspace | `d0cc677`, `97f3567`, `9490e3a`, `396023f` | independent caches, history, transfer, entity budgets and failure injection |
| Mode-aware AI and viewport navigation | `3db6018`, `cb9e0a4`, `b6ce385`, `afd19ad` | Hybrid XYZ generation and 2.5D/3D pan/zoom/frame regressions |

## Codex responsibilities

- implemented TypeScript production code and deterministic pure functions;
- wrote and maintained unit/integration/production Chromium tests;
- diagnosed perceptual failures using the data path before changing mappings;
- kept AI outside the audio/data plane and preserved no-key fallback;
- recorded material architecture deviations in `docs/DECISION_LOG.md`;
- prepared release scope, security/license audit, evidence, and static verification output.

## Human decisions and acceptance

The owner decided to extend the accepted 2.5D MVP toward bounded Hybrid 3D, requested modelling-software interaction patterns, selected independent mode projects, defined active-listener switching, requested wall/Portal vertical/thickness authoring, and accepted the implemented perceptual/UI gates. Human headphone checks are not replaced by automated claims.

## Evidence locations

- Detailed decisions: `docs/DECISION_LOG.md`
- Implementation status and prior gates: `docs/STATUS.md`
- Test procedures: `docs/ACCEPTANCE_TESTS.md`
- Chronology: `artifacts/evidence/commit-timeline.csv`
- Final static result: `artifacts/release/static-verification-summary.md`
