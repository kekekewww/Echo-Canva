# Autonomous Implementation Plan

## Header

- Build mode: autonomous.
- Human role: four acceptance gates only.
- Writer model: one root Codex thread.
- Subagents: read-only exploration and review.
- Git cadence: one focused commit per item.
- Verification cadence: every item; full `pnpm verify` per milestone.
- Scope changes: prohibited unless a required feature is removed in exchange.
- Submission work begins immediately after Gate C; it is not postponed to the final hours.

## Milestone map

| Milestone | Outcome | Human gate |
|---|---|---|
| M0 | Repository governance and executable scaffold | No |
| M1 | Raw-audio vertical slice and usable editor shell | Gate A |
| M2 | Deterministic occlusion, portal, reflection, and room metrics | Gate B |
| M3 | Web Audio simulation and stable A/B experience | Included in Gate B |
| M4 | GPT-5.6 compiler and explanation | Gate C |
| M5 | Hardening, deployment, and submission package | Gate D |

## Item 0 — Repository and governance bootstrap

Spec ref: `ARCHITECTURE.md > Repository structure`

What to build:

- Initialize Git and pnpm project.
- Scaffold Next.js TypeScript App Router.
- Add lint, typecheck, Vitest, Playwright, and `pnpm verify`.
- Add `.env.example`, `.gitignore`, license, and basic README.
- Copy and honor `.codex` configuration.
- Create `docs/PROGRESS.md`.
- Create initial commit and build branch.

Acceptance:

- Fresh install succeeds.
- `pnpm dev` opens a placeholder page.
- `pnpm verify` passes.
- No secret files tracked.

Verify:

```bash
pnpm install
pnpm verify
git status --short
```

Exit evidence:

- Commit hash.
- Dependency inventory.
- No high-severity audit issue without a documented decision.

## Item 1 — Scene schema, catalogs, presets, and validation

Spec ref: `ARCHITECTURE.md > Scene data model`

What to build:

- TypeScript and Zod schemas.
- Material and audio clip catalogs.
- Semantic validator.
- Three required presets.
- Scene migrations with schema version.
- Unit fixtures for valid and invalid scenes.

Acceptance:

- All presets pass schema and semantic validation.
- Invalid self-intersecting boundary fails.
- Unknown material and clip IDs fail.
- Scene caps and coordinate bounds fail clearly.

Verify:

```bash
pnpm test -- scene
pnpm typecheck
```

## Item 2 — Editor shell and state management

Spec ref: `ARCHITECTURE.md > UI structure`

What to build:

- Three-panel desktop layout.
- SVG room editor.
- Listener, source, wall, and portal rendering.
- Selection and inspector.
- Dragging with grid snap.
- Undo/redo for scene edits.
- localStorage autosave.
- Import/export JSON.
- Canvas overlay placeholder.

Acceptance:

- Presets load.
- Objects can be selected and moved.
- Export then import round-trips exactly.
- Refresh restores the last valid scene.
- Keyboard controls do not trap focus.

Verify:

```bash
pnpm test -- editor store
pnpm test:e2e --grep "edit and persist"
```

## Item 3 — Raw audio vertical slice

Spec ref: `ARCHITECTURE.md > Web Audio graph`

What to build:

- Explicit Enable Audio flow.
- Asset loading with license metadata.
- One source playback, then multiple source chains.
- Listener orientation.
- HRTF PannerNode.
- Distance attenuation.
- Master gain and play/pause.
- Raw/Simulated crossfade UI, initially identical.

Acceptance:

- Audio never starts before user gesture.
- At least two mono sources play.
- Moving a source left/right is audible on headphones.
- Pause/resume works without duplicate sources.
- Missing asset produces visible source-level error.

Verify:

```bash
pnpm test -- audio
pnpm test:e2e --grep "enable audio"
pnpm build
```

### Gate A

Human runs Gate A in `ACCEPTANCE_TESTS.md`. Do not continue if it fails.

## Item 4 — Geometry primitives and worker protocol

Spec ref: `ARCHITECTURE.md > Worker protocol`

What to build:

- Robust segment intersection.
- Polygon area and orientation.
- Point-in-polygon.
- Wall/portal gap representation.
- Worker request/response protocol.
- Revision and stale-frame handling.
- Development compute-time metrics.

Acceptance:

- Geometry fixture suite passes.
- Worker produces deterministic output.
- Stale frames never overwrite newer scene state.
- Listener dragging does not block the main thread.

Verify:

```bash
pnpm test -- geometry worker
pnpm test:coverage
```

Coverage expectation:

- Geometry modules: at least 90% branch coverage.
- Worker protocol: all union variants covered.

## Item 5 — Direct occlusion and parameter mapping

Spec ref: `ARCHITECTURE.md > Direct visibility`

What to build:

- Direct source-to-listener visibility.
- Crossed-wall collection.
- Frequency-band loss aggregation.
- Pure mapping functions for dry gain and low-pass cutoff.
- Direct-path diagnostic overlay.
- Acoustic metrics panel.

Acceptance:

- No wall: near-unity dry gain and open cutoff.
- Concrete partition: clearly lower gain and cutoff.
- Soft panel: different spectral behavior from concrete.
- Edge contact and parallel-wall cases are stable.
- All values are finite and clamped.

Verify:

```bash
pnpm test -- occlusion
pnpm test:e2e --grep "occlusion metrics"
```

## Item 6 — Portal-aware routing

Spec ref: `ARCHITECTURE.md > Portal routing`

What to build:

- Visibility graph.
- Portal openness.
- Dijkstra/A* path selection.
- Perceived position at first portal from listener.
- Portal route diagnostics.
- Closed/no-route fallback.

Acceptance:

- Direct path preferred when clear.
- When blocked, an open portal route is selected.
- Closing the portal changes route to blocked or a valid alternative.
- Narrower or less-open portal increases attenuation.
- Tie breaking is deterministic.

Verify:

```bash
pnpm test -- portal visibility
pnpm test:e2e --grep "portal route"
```

## Item 7 — First-order reflections and room reverb metrics

Spec ref: `ARCHITECTURE.md > First-order reflections`

What to build:

- Source mirroring.
- Reflection point validation.
- Path-leg visibility.
- Energy ranking and four-tap cap.
- Room volume and equivalent absorption.
- Three-band RT60 estimates.
- Reverb signature.
- Reflection and room diagnostics.

Acceptance:

- Concrete preset yields stronger/longer reflection behavior than soft studio.
- Invalid reflection points are rejected.
- No NaN/Infinity for tiny or extreme valid rooms.
- Moving listener changes reflection paths but not room signature.
- Changing room geometry or materials changes signature.

Verify:

```bash
pnpm test -- reflection reverb
pnpm test:coverage
```

## Item 8 — Simulated audio renderer

Spec ref: `ARCHITECTURE.md > Web Audio graph`

What to build:

- Apply dry gain and low-pass from AcousticFrame.
- Apply perceived portal position to PannerNode.
- Build up to four reflection tap chains.
- Generate synthetic stereo impulse response.
- Dual-convolver crossfade on room signature change.
- Parameter smoothing.
- Audible Raw/Simulated A/B.

Acceptance:

- Occlusion transitions have no obvious clicks.
- Portal position is audibly plausible on headphones.
- Reflection/reverb changes are audible across presets.
- Updating a room does not glitch due to in-place buffer replacement.
- Output does not clip with default scenes.

Verify:

```bash
pnpm test -- renderer smoothing reverb-engine
pnpm test:e2e --grep "raw simulated"
pnpm build
```

### Gate B

Human runs Gate B. If the portal effect is not clearly audible, tune mapping or demo geometry. Do not add more physics.

## Item 9 — GPT-5.6 scene compiler

Spec ref: `ARCHITECTURE.md > AI control plane`

What to build:

- Server-only OpenAI client.
- `POST /api/scene/compile`.
- Strict Structured Output schema.
- Prompt versioning.
- Semantic validator integration.
- One bounded repair attempt.
- Timeout and typed errors.
- Mock client for tests.
- Three golden natural-language fixtures.

Acceptance:

- Each golden prompt returns a valid SceneSpec.
- Unknown materials never enter client state.
- Prompt-injection text cannot alter response shape.
- Timeout leaves the current scene unchanged.
- No API key appears in browser source or logs.
- Mocked test suite works without internet.

Verify:

```bash
pnpm test -- ai compile semantic
pnpm test:e2e --grep "compile scene"
pnpm build
```

## Item 10 — GPT acoustic explanation and guided demo

Spec ref: `ARCHITECTURE.md > POST /api/scene/explain`

What to build:

- `POST /api/scene/explain`.
- Structured concise response.
- Explanation tied only to SceneSpec and AcousticFrame.
- Approximation caveat.
- Guided demo steps.
- Preset fallback explanation when API is unavailable.

Acceptance:

- Blocked concrete route is described correctly.
- Portal route names the active portal behavior.
- Explanation never claims measurement-grade accuracy.
- API failure does not hide deterministic metrics.
- Guided demo reaches the wow moment in under 90 seconds.

Verify:

```bash
pnpm test -- explain
pnpm test:e2e --grep "guided demo"
```

## Item 11 — Product polish, accessibility, and resilience

Spec ref: `PRODUCT_REQUIREMENTS.md > Non-functional requirements`

What to build:

- Empty/loading/error states.
- Headphone recommendation.
- Keyboard access and labels.
- Responsive minimum desktop layout.
- Browser compatibility warning.
- Performance instrumentation and caps.
- No-API demo mode.
- Asset-license page.
- Error boundary and worker recovery.

Acceptance:

- Accessibility audit has no critical issue.
- Default scene remains interactive under caps.
- Disabling the API still leaves a complete preset demo.
- Worker failure has visible recovery.
- All judge-facing copy is English.

Verify:

```bash
pnpm verify
pnpm test:e2e
```

Spawn all four configured reviewers. Fix P0/P1 issues and document accepted P2 issues.

## Item 12 — Deployment and release candidate

Spec ref: `ARCHITECTURE.md > Deployment and environment`

What to build:

- Production deployment.
- Environment configuration.
- Basic request-rate control and spend protections.
- Production smoke test.
- Release-tag candidate.
- Public test instructions.

Acceptance:

- Public URL loads from a clean browser profile.
- Presets and audio work.
- AI compile works or provides a recoverable error.
- Repository setup works from README.
- No private environment data appears in output.

Verify:

```bash
pnpm verify
pnpm test:e2e --project=chromium
pnpm build
```

### Gate C

Human runs Gate C.

## Item 13 — Submission package

Spec ref: `SUBMISSION_CHECKLIST.md`

What to build:

- Final English README.
- Architecture diagram.
- Setup and test instructions.
- Codex/GPT-5.6 collaboration section.
- Limitations and licensing.
- Three screenshots.
- Demo script and shot list.
- Public YouTube video below three minutes.
- Devpost project description.
- `/feedback` Session ID.
- Final release tag.

Acceptance:

- Every submission checklist item is complete.
- Video explicitly covers what was built, Codex use, and GPT-5.6 use.
- Demo URL and repository are accessible.
- Submission is not left as draft.
- Final commit/tag matches the tested deployment.

Verify:

```bash
pnpm verify
git status --short
git tag --list
```

### Gate D

Human performs final submission review and returns `PASS` or `FAIL`.

## Autonomous recovery rules

- If an algorithm is unstable, fall back to a simpler tested approximation.
- If AI integration blocks, ship manual/preset core first, then restore AI.
- If dynamic reverb is unstable, reduce update frequency; never remove crossfade protection.
- If UI work exceeds budget, keep desktop-only and cut decorative animation.
- If portal audio is unclear, tune mappings and preset geometry; do not add diffraction.
- If time pressure threatens submission assets, freeze code after Gate C and prioritize README, video, and deployment.
