# Multicore Task 3 Report

## Design

- Added a persistent Hybrid source Worker pool using the shared `classicSourcePoolCapacity()` policy, with two logical cores reserved and a maximum of four Workers.
- The pool accepts the current `SceneDocumentV2` together with its already-compiled `HybridGeometry`. It installs the supplied `{ staticGeometryHash, patches, bvh }` only when each Worker's installed fingerprint changes.
- Source IDs are assigned round-robin by authored index. A normal compute message contains only the request ID, static fingerprint, compact `HybridDirectPoseSnapshot`, and assigned source IDs.
- Only one job may be in flight. New updates replace one pending document/geometry pair; obsolete completions are fully suppressed.
- Runtime Worker replies are treated as untrusted. The pool validates response identity, arrays, exact shard sizes and assignments, revision/fingerprint/projection identity, complete finite direct-path/hit/reflection payloads, and finite non-negative timing before assembly through `assembleHybridDirectFrame`.
- Any Worker/payload/assembly failure terminates the complete pool once and atomically computes the latest full `HybridGeometry` through the deterministic serial fallback. No partial or mixed frame is published.
- Pool results expose whole-frame wall latency, completion time, active Worker count, maximum shard time, and total shard time.
- The Hybrid hook now owns the pool lifecycle. Disposal cancels cadence timers, sends `DISPOSE`, terminates each Worker exactly once, and ignores late callbacks.
- The viewport accepts Worker and fallback frames only when both revision and Classic projection hash match. Matching fallback drives direct audio, reflection audio, overlays, and a truthful `Fallback` status; stale fallback remains rejected.
- Removed the temporary legacy `COMPUTE` request, `FRAME` response, legacy compiler cache, and legacy direct-compute error code from the Hybrid Worker.

## Files

- Created `src/workers/hybrid-direct-pool.ts`.
- Modified `src/hooks/useHybridDirectPaths.ts`.
- Modified `src/workers/hybrid-direct.worker.ts`.
- Modified `src/components/workspace/HybridViewportAdapter.tsx`.
- Created `tests/unit/hybrid-direct-pool.test.ts`.
- Modified `tests/unit/hybrid-direct-worker.test.ts`.
- Created `tests/unit/hybrid-viewport-adapter.test.ts`.
- `WorkspaceStatusBar.tsx` already exposed and rendered the optional pool metrics, so no change was necessary.
- Did not touch or stage `echo-canvas-3d-extension-pack/`.

## RED evidence

1. `pnpm test -- hybrid-direct-pool`
   - Expected failure after correcting test syntax: `Cannot find package '@/workers/hybrid-direct-pool'`.
   - This established the missing pure pool boundary before production implementation.
2. `pnpm test -- hybrid-direct-worker hybrid-viewport-adapter`
   - Expected failures: the legacy `COMPUTE` request still emitted `FRAME`, and `resolveHybridAcousticPresentation` did not exist.
   - This established legacy-protocol removal and fallback/stale adapter acceptance before integration implementation.
3. `pnpm test -- hybrid-direct-pool`
   - Expected single behavioral failure: a document paired with geometry compiled for a different document incorrectly dispatched Workers.
   - The pool was then tightened to require the matching compiled document/geometry pair.

## GREEN evidence

- `pnpm test -- hybrid-direct-pool hybrid-direct-worker hybrid3d-direct hybrid3d-audible-direct hybrid-path-overlay`
  - PASS: 69 test files, 458 tests.
- `pnpm lint`
  - PASS: zero warnings/errors.
- `pnpm typecheck`
  - PASS: strict TypeScript check.
- `pnpm test`
  - PASS: 69 test files, 458 tests.
- `pnpm build`
  - PASS: Next.js 16.2.10 optimized production build, TypeScript, page data, and all eight static pages.
- `rg -n 'type: "COMPUTE"|type: "FRAME"|HYBRID_DIRECT_COMPUTE_FAILED' src`
  - PASS: no production source matches.
- `git diff --check`
  - PASS: no whitespace errors (Git only reported the repository's LF-to-CRLF working-copy notices).

## Commit

- Subject: `feat(acoustics): parallelize hybrid sources`
- Commit SHA: the exact SHA is returned in the SDD status contract after creating the commit. A commit cannot contain its own cryptographic SHA.

## Self-review

- Confirmed active Worker count is `min(sourceCount, capacity)` and assignments retain authored source order after reverse completion.
- Confirmed pose-only updates do not reinstall static geometry; wall, Portal, material, vertical-bound, and primitive changes install before compute.
- Confirmed source addition/removal preserves existing Workers within capacity and neither duplicates nor drops source results.
- Confirmed request ID, fingerprint, revision, projection hash, assignment, array/null, nested path/hit/reflection, timing, typed error, constructor, event, assembly, and disposal failure paths fail closed exactly once.
- Confirmed fallback always recomputes the latest complete geometry and cannot mix with accepted Worker shards.
- Confirmed the existing audible-direct, path-overlay, reflection, worker, full unit, and production-build gates remain green.

## Concerns

- Static BVH data is cloned once per active Worker whenever its fingerprint changes; this is intentional and bounded by four Workers. Pose interaction sends only compact snapshots.
- The serial fallback runs on the main thread by design only after the Worker pool becomes unavailable, while retaining the bounded 10–15 Hz cadence.
- No formulas, BVH intersection behavior, reflection ranking, public `HybridDirectFrame`, Web Audio topology, or Classic runtime code changed.

## Reviewer timestamp correction

- Review found that successful pool frames used job start time for `computedAtMs`, and serial fallback frames used fallback start time. Both contradicted the public completion-timestamp semantics.
- RED: `pnpm test -- hybrid-direct-pool` failed exactly two tests: Worker completion expected `20` but received `0`; fallback completion expected `125` but received `100`.
- GREEN implementation:
  - successful shard assembly now passes the final whole-frame `completedAtMs` to `assembleHybridDirectFrame`;
  - serial fallback computes once, samples completion afterward, and immutably replaces only `computedAtMs`, avoiding a second expensive acoustic computation;
  - `computeMs` remains `completedAtMs - startedAtMs`.
- GREEN verification:
  - `pnpm test -- hybrid-direct-pool`: PASS, 69 files / 459 tests;
  - `pnpm typecheck`: PASS.
- Fix commit subject: `fix(acoustics): stamp completed hybrid frames`.
