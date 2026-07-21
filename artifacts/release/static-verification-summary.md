# Static Verification Summary

Final run: 2026-07-20 01:01 (Asia/Taipei)

Branch: `codex/echo-canvas-mvp`

Base commit before release evidence: `03ba72c5da3f79cb61b36eda4958ecc666cd8808`
Verified application commit: `e05f38c`

Release evidence commit: `f43a07c`

## Result

**PASS — internal static release candidate.**

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS, lockfile already current |
| `pnpm lint` | PASS, zero warnings |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, 61 files / 359 tests |
| `pnpm build` | PASS, `/`, `/classic`, `/lab`, icon, compile API and explain API built |
| Playwright production Chromium | PASS, 38 / 38 |
| 100-wall / 8-Portal / 4-source / 8-listener budget | PASS, Worker p95 `<12 ms`, no observed `>50 ms` interaction long task |
| `git diff --check` | PASS (line-ending notices are informational) |
| Client static bundle credential marker scan | PASS, 0 matching files |
| Current tracked credential-shaped value scan | PASS, 0 matching files |
| Reachable Git history credential-shaped value scan | PASS, 0 matching commits |
| Dependency critical gate | PASS, 0 critical / 0 high; 1 documented moderate transitive PostCSS advisory |

Raw output:

- `artifacts/release/install-output.txt`
- `artifacts/release/verify-output.txt`
- `artifacts/release/e2e-output.txt`

## Blocker repaired during final verification

The first full run exposed a 16 ms Worker p95 sample. Investigation proved that active-listener pose changes invalidated a full-projection static BVH key, and the main-thread fallback repeated document clone/validation/static compilation. Further production stress runs exposed unnecessary reconciliation of hundreds of unchanged wall polygons and Outliner rows.

The repair now:

- fingerprints only geometry-affecting room/wall/Portal/material/vertical fields;
- reuses static patches/BVH for Listener/source pose changes in Worker and fallback paths;
- keeps full validation at external/AI/import/migration/scene-replacement boundaries while using trusted reducer invariants for the hot internal projection;
- memoizes unchanged 3D wall surfaces and Outliner rows;
- adds regression tests that prove pose-only updates compile static geometry once.

The focused production stress case passed five consecutive repair-verification runs in total (two after geometry/projection caching and three after render memoization), followed by the complete 38-test production suite passing.

## What this PASS does not claim

This is not public deployment acceptance, cross-device headphone acceptance, video completion, Devpost submission, or `/feedback` completion. Those remain owner-operated Gate E actions.
