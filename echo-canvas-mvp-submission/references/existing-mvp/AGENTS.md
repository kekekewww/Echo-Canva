# AGENTS.md

## 1. Mission

Build and ship a browser-based AI spatial-audio prototyping tool for OpenAI Build Week.

The human owner is the product approver and manual tester only. Codex owns planning refinement, implementation, automated tests, debugging, documentation, deployment preparation, and submission preparation within the constraints below.

Internal codename: `EchoCanvas`.

## 2. Product promise

A user can:

1. describe an acoustic scene in natural language or edit it on a 2D canvas;
2. place a listener, point sound sources, walls, materials, and explicit portals;
3. hear deterministic approximations of occlusion, portal routing, first-order reflections, room reverb, distance attenuation, and browser HRTF spatialization;
4. compare Raw versus Simulated audio;
5. understand why the sound changed;
6. export and import a versioned SceneSpec JSON document.

GPT-5.6 compiles intent into a validated SceneSpec and explains deterministic engine results. GPT-5.6 MUST NOT sit inside the real-time audio loop and MUST NOT invent physics coefficients.

## 3. Scope freeze

### Required

- Single-room 2.5D editor with one simple outer boundary polygon.
- Internal wall segments with thickness and material.
- Explicit door/window portal segments.
- One listener.
- Up to four bundled mono point sources.
- Three-band material presets: low, mid, high.
- Direct-path occlusion and transmission loss.
- Portal-aware shortest viable path.
- First-order image-source reflections, capped at four taps per source.
- Room-level RT60 approximation and synthetic stereo impulse response.
- `PannerNode` with `panningModel = "HRTF"`.
- Raw/Simulated A/B.
- Natural-language scene compilation with GPT-5.6 Structured Outputs.
- Acoustic explanation generated from deterministic metrics.
- Import/export JSON.
- Public deployable demo.
- Automated unit, integration, and browser tests.
- English README and submission assets.

### Explicitly excluded

- Binaural de-spatialization or dry-source recovery.
- Arbitrary user-uploaded binaural audio.
- Custom MIT/KEMAR HRIR selection.
- Full wave-equation diffraction.
- Full 3D geometry.
- More than one acoustically independent room.
- More than one reflection order.
- Per-frame impulse-response replacement.
- Native Godot/OpenAL build.
- User accounts, database, collaborative editing, payments.
- Mobile-first editing.
- Claims of architectural-acoustics accuracy.

Never re-add excluded items during the hackathon.

## 4. Engineering operating model

### Main thread

The root Codex thread is the only writer unless it explicitly creates a non-overlapping worktree. Default behavior: one writer, serial commits.

The root thread must:

- read all files in `docs/` before implementation;
- create and maintain `docs/PROGRESS.md`;
- record material decisions in `docs/DECISIONS.md`;
- implement one checklist item at a time;
- run verification commands before marking an item complete;
- invoke a review after each milestone;
- fix all P0 and P1 findings before proceeding;
- keep the application runnable after every commit.

### Subagents

Use subagents for read-heavy independent work:

- `acoustics_reviewer`: acoustic logic, units, edge cases, perceptual plausibility.
- `qa_reviewer`: test gaps, regressions, failure handling.
- `ui_reviewer`: usability, accessibility, demo clarity.
- `security_reviewer`: API key exposure, prompt/input abuse, unsafe dependencies.

Do not let multiple subagents edit the same files concurrently. Subagents return evidence and recommendations to the root thread.

### Decision policy

Do not ask the human about ordinary implementation choices. Choose the simplest defensible option, record it, and continue.

Pause only at Gate A, B, C, or D, or when one of these blocking conditions is true:

- the human must provide an account credential or API key;
- a licensing decision affects submission eligibility;
- the product would need to violate the scope freeze;
- a destructive operation affects data outside the repository;
- deployment requires billing authorization.

## 5. Safety and permissions

- Never commit secrets.
- Keep `OPENAI_API_KEY` server-only.
- Provide `.env.example`, never `.env`.
- Default to workspace-write sandboxing and approval on request with auto-review.
- Never use unrestricted full-access or bypass sandbox flags.
- Do not force-push, rewrite shared history, delete remote resources, or rotate credentials.
- Do not upload code or assets to third parties except the selected Git host and deployment provider.
- Validate all model output again with Zod and semantic constraints even when Structured Outputs is enabled.
- Reject prompts longer than the configured maximum.
- Bundle only audio with documented compatible licensing or original ownership.

## 6. Quality rules

- TypeScript strict mode.
- No `any` unless justified in a code comment.
- No ignored promise rejections.
- No silent fallback that changes physics semantics.
- Units must be explicit in names: `distanceMeters`, `delaySeconds`, `cutoffHz`, `gainLinear`, `rt60Seconds`.
- All geometry math must have unit tests.
- All model prompts must be versioned in source control.
- All API payloads must have schemas.
- Audio parameters must be smoothed; do not write abrupt values that produce zipper noise.
- Replace reverb convolvers by crossfading nodes; do not swap an active convolver buffer in place.
- Geometry and AI failures must leave the last valid scene active.
- The app must include a no-API preset demo path.

## 7. Performance budgets

- Supported reference browser: current stable Chrome or Edge desktop.
- Scene caps: 64 walls, 8 portals, 4 sources, 4 reflection taps per source.
- Acoustic worker update target: 20 Hz during dragging.
- Visual target: 60 FPS on the reference laptop with the default scene.
- No long task over 50 ms during normal listener dragging.
- Audio parameter interpolation: 50–150 ms, selected per parameter.
- Initial preset demo must work before any GPT request.
- GPT compilation timeout: 30 seconds with clear recovery.
- Audio context starts only after explicit user gesture.

If a performance budget fails, reduce diagnostic ray count or visual detail before reducing core audio behavior.

## 8. Required commands

Codex should establish scripts equivalent to:

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm verify
```

`pnpm verify` must run lint, typecheck, unit/integration tests, and production build.

## 9. Git discipline

- Branch from `main` into `build/<milestone>`.
- Commit after each implementation-plan item that passes its verification.
- Commit format: `type(scope): outcome`.
- Keep commits reversible and focused.
- Tag the final tested candidate `v0.1.0-build-week`.
- Preserve dated commit history as evidence of work during the submission period.

## 10. Human approval gates

- Gate A: foundation and raw-audio vertical slice.
- Gate B: deterministic acoustic engine and audible occlusion/portal behavior.
- Gate C: GPT scene compiler, end-to-end experience, deployment candidate.
- Gate D: final submission package.

At each gate, present:

1. deployed or local URL;
2. exact test steps from `docs/ACCEPTANCE_TESTS.md`;
3. known limitations;
4. automated verification summary;
5. the commit hash.

The human response is `PASS` or `FAIL` plus observations. A failure becomes a bounded bug-fix cycle, not a scope expansion.

## 11. Definition of done

The project is done only when:

- all required scope items work in the deployed demo;
- `pnpm verify` passes;
- Playwright critical flow passes;
- all four human gates pass;
- README documents setup, architecture, testing, limitations, and Codex/GPT-5.6 use;
- no secrets or unlicensed assets are present;
- the demo video is below three minutes and has English narration or captions;
- repository and test access are ready for judges;
- `/feedback` Session ID is captured;
- Devpost draft is complete and not left in draft at final submission.
