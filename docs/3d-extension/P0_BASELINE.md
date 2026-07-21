# Hybrid 3D P0 — Immutable Classic Baseline

Status: **complete — Gate R0 evidence ready**

The Hybrid 3D programme is additive. The existing browser application remains the authoritative `classic-2d5d` path until a later release gate explicitly promotes Hybrid 3D. A 3D solver must never silently replace, reinterpret, or perturb a v1 `SceneSpec` in Classic mode.

## Locked reference

- Git tag: `v0.1.0-mvp-baseline`
- Commit: `dd6890b97a97003845c11c35c97af4c07f24d939`
- Deterministic artifact: `benchmarks/results/mvp-baseline.json`
- Browser-audio artifact: `benchmarks/results/mvp-baseline-audio.json`

The tag was created before this P0 work. The two artifacts are versioned, reviewed inputs to later Hybrid release decisions rather than generated build output.

The working-tree deterministic artifact advanced to version `1.1` under approved decision `D-048` after human Gate E transient testing. The original version `1.0` remains immutable at the recorded tag and commit; version `1.1` intentionally changes only the reviewed scattering/specular material mapping and its downstream RT60 values.

## Deterministic regression oracle

`src/benchmarks/classic-baseline.ts` produces a rounded, stable projection of the existing `AcousticFrame`. `tests/unit/classic-baseline-capture.test.ts` requires an exact match to `mvp-baseline.json`.

The ten scenarios cover the important Classic contracts:

| Group | Scenarios | Contract protected |
| --- | --- | --- |
| Concrete partition | C001–C005 | direct, portal-aware routing, blocked fallback, listener motion |
| Hard room | C006–C007 | first-order wall reflections and long RT60 profile |
| Treated room | C008–C009 | reduced RT60/reflection energy and source motion |
| Stress | C010 | 100-wall deterministic Classic frame |

The projection checks route type, visibility, distances, dry gain, low-pass cutoff, perceived position, portal/occluder identifiers, first-order reflection path metrics, room volume, and three-band RT60. Exact equality is intentional because the Classic compute path is deterministic.

## Audio and interaction reference

The browser-audio artifact records the existing production Playwright OfflineAudioContext evidence:

- equal-band 0.8 s Schroeder target rendered as an estimated 0.82 s tail with finite stereo output;
- Raw/Simulated crossfade remained finite with a relative adjacent-sample step of `0.000282`, below the existing 1% threshold.

Existing production browser coverage additionally verifies preset changes, portal interaction, source/listener movement, SceneSpec import/export, OpenRouter/no-key error handling, and the 100-wall interaction budget. These flows remain part of `pnpm e2e`.

## Gate R0 acceptance criteria

1. `v0.1.0-mvp-baseline` resolves to the pre-Hybrid Classic commit.
2. The deterministic oracle matches exactly.
3. The full Classic verification suite passes: `pnpm verify`.
4. There is no Hybrid engine route, UI switch, or scene-v2 migration in P0.
5. The extension pack under `echo-canvas-3d-extension-pack/` remains user-supplied source material and is not committed as product code.

## Rollback rule

Any later phase that breaks the Classic oracle, its critical browser flows, or stable audio output must leave Hybrid disabled and return the user to the Classic path. A failing Hybrid feature is never allowed to make direct visibility, portal propagation, or the existing audio graph unavailable.
