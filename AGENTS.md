# AGENTS.md — Spatial Audio Prototype

## Mission

Build a deployed, judge-testable browser application that converts a natural-language scene description or a manually edited 2D floor plan into a deterministic spatial-audio preview.

The project is for OpenAI Build Week 2026. The submission must visibly and credibly use Codex and GPT-5.6, while all acoustic calculations remain deterministic and testable.

## Non-negotiable product scope

Implement:

1. 2D room/wall/portal editor.
2. Draggable listener and up to four mono point sources.
3. Three-band acoustic materials.
4. Exact direct-path visibility and wall occlusion.
5. Explicit open-portal routing approximation.
6. First-order image-source early reflections in both modes, plus bounded second-order reflections in Hybrid 3D when the direct path is blocked.
7. Three-band Eyring RT60 estimation.
8. Browser HRTF rendering through Web Audio `PannerNode`.
9. Stable late reverberation using a Schroeder network; FDN is optional only after all MVP acceptance tests pass.
10. GPT-5.6 natural-language-to-`SceneSpec` compilation using strict Structured Outputs.
11. GPT-5.6 explanation of deterministic `AcousticSnapshot` results.
12. Raw/Simulated A/B mode, debug overlays, JSON import/export, deployed demo.

Explicitly do not implement:

- arbitrary binaural de-spatialization or dry-source recovery;
- true wave diffraction;
- a claim of physical or architectural-acoustics accuracy;
- custom MIT/KEMAR convolution in the MVP;
- native Godot/OpenAL packaging;
- full 3D geometry;
- third- or higher-order image-source reflections;
- dynamically replacing convolution buffers each acoustic update;
- databases, authentication, payments, collaboration, or user accounts.

## Product language

Use these terms:

- "interactive acoustic approximation";
- "portal-aware sound propagation";
- "first-order early reflections";
- "perceptually tuned material presets";
- "browser HRTF rendering";
- "spatial-audio prototyping and previsualization."

Do not use these claims:

- "physically accurate diffraction";
- "scientifically validated room simulation";
- "MIT/KEMAR rendering" unless a specific licensed dataset is actually implemented;
- "binaural deconvolution";
- "dry-source reconstruction."

## Required stack

Prefer boring, reliable technology:

- Next.js App Router;
- React and TypeScript with strict mode;
- pnpm;
- OpenAI JavaScript SDK and Responses API;
- JSON Schema plus Zod or Ajv runtime validation;
- Web Audio API;
- Web Worker for deterministic acoustic computation;
- Vitest for unit tests;
- Playwright for browser acceptance tests;
- Vercel-compatible deployment.

Lock concrete package versions in `pnpm-lock.yaml` during bootstrap. Do not upgrade dependencies after the integration gate unless fixing a blocking defect.

## Architecture constraints

- GPT-5.6 is a control-plane component. It may produce a candidate `SceneSpec` or explain an `AcousticSnapshot`.
- GPT-5.6 must never directly set Web Audio parameters, calculate RT60, select reflection paths, execute code, emit arbitrary URLs, or load arbitrary user content.
- Validate all model output against strict JSON Schema and domain invariants.
- Allow at most one repair attempt after a schema/domain validation failure.
- All geometry and acoustic functions must be pure and deterministic where practical.
- The audio graph must be created once and updated by parameter automation; do not create and destroy nodes every acoustic frame.
- Run acoustic calculations in a Worker at 10–15 Hz. Render the UI independently at normal display rate.
- Smooth gain, filter, send, and panner changes over approximately 60–100 ms.
- All API keys remain server-side.
- Provide a preset-only fallback when the OpenAI API is unavailable.

## Limits

Enforce these hard limits:

- maximum 100 wall segments;
- maximum 8 portals;
- maximum 4 point sources;
- maximum 6 ranked first/second-order early-reflection taps per source;
- maximum room dimension 50 m;
- minimum wall length 0.1 m;
- material IDs must come from the built-in registry;
- audio assets must be local, owned, or clearly licensed;
- user prompts maximum 2,000 characters.

## Quality gates

After every checklist item, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

At integration gates, also run:

```bash
pnpm e2e
pnpm build
```

Do not mark a task complete when tests are skipped, commented out, flaky, or only manually inferred.

## Documentation duties

Before coding, read:

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/ACOUSTICS.md`
- `docs/API_CONTRACTS.md`
- `docs/BUILD_CHECKLIST.md`
- `docs/ACCEPTANCE_TESTS.md`

Maintain:

- `docs/STATUS.md`: current checklist item, test results, known defects, next action;
- `docs/DECISION_LOG.md`: important deviations and rationale;
- `README.md`: setup, demo, architecture summary, Codex/GPT-5.6 collaboration;
- third-party licenses and audio attribution.

Do not silently change formulas, limits, API contracts, or acceptance thresholds. Record deviations first.

## Git discipline

- Use one commit per completed vertical slice.
- Prefer conventional commit subjects such as `feat(acoustics): add direct path occlusion`.
- Never rewrite published history.
- Keep the principal Codex session in which the majority of core functionality is built.
- Before submission, run `/feedback` in that session and record the resulting Session ID privately for the Devpost form.

## Autonomous execution policy

Proceed through `docs/BUILD_CHECKLIST.md` autonomously.

Stop only at the defined human acceptance gates:

1. direct HRTF and editor;
2. occlusion and portal perception;
3. reflections and reverb;
4. GPT scene compiler;
5. final deployed submission candidate.

At each gate, provide:

- deployed/local URL;
- exact steps for the human tester;
- expected result;
- current test report;
- known deviations;
- a single explicit verdict request: PASS or FAIL.

A FAIL authorizes defect repair only. Do not expand scope during repair.
