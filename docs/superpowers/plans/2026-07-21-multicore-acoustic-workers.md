# Multicore Acoustic Workers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run independent Classic 2.5D and Hybrid 3D per-source acoustic calculations concurrently on a bounded pool of persistent Web Workers while preserving deterministic, atomic frames and current fallbacks.

**Architecture:** Each mode owns a browser-side coordinator that creates at most four persistent workers. Static scene/geometry is installed only when its fingerprint changes; pose updates are deterministically sharded by authored source index. The coordinator publishes a frame only after every matching shard completes, merges results in authored order, suppresses stale jobs, and falls back to the existing serial oracle after any pool failure.

**Tech Stack:** TypeScript strict mode, React hooks, browser Web Workers, Vitest, Playwright, existing deterministic acoustic engines.

## Global Constraints

- Maximum 100 wall segments, 8 portals, 4 point sources, and 6 early-reflection taps per source.
- Acoustic results remain pure and deterministic; response arrival order must never alter frame ordering or values.
- Worker count is `min(4, max(1, hardwareConcurrency - 2))`; only as many workers as needed for the current source count receive a shard.
- One source and unsupported/low-core environments retain valid single-worker behavior.
- Static geometry is cloned to each worker only when its deterministic fingerprint changes; normal pose updates send compact snapshots.
- A frame is published only when all shards match request ID, revision, and static fingerprint.
- Any constructor, runtime, message, protocol, or shard failure terminates the pool and activates the complete deterministic serial fallback; partial worker/fallback frames are forbidden.
- The persistent Web Audio graph and all acoustic formulas, caps, material mappings, and downstream frame contracts remain unchanged.
- Main-thread UI rendering remains independent of the 10–15 Hz acoustic update cadence.

---

### Task 1: Extract deterministic per-source compute seams and shard worker protocols

**Files:**
- Modify: `src/acoustics/compute-frame.ts`
- Modify: `src/acoustics/hybrid3d/direct.ts`
- Modify: `src/acoustics/hybrid3d/compile.ts`
- Create: `src/workers/classic-source.worker.ts`
- Modify: `src/workers/hybrid-direct.worker.ts`
- Test: `tests/unit/compute-frame.test.ts`
- Test: `tests/unit/hybrid3d-direct.test.ts`
- Test: `tests/unit/hybrid-direct-worker.test.ts`
- Test: `tests/unit/classic-source-worker.test.ts`

**Interfaces:**
- Produce a Classic static context/fingerprint, compact pose snapshot, single-source result function, and strict ordered frame assembler.
- Produce `HybridDirectPoseSnapshot`, `HybridDirectSourceResult`, `computeHybridDirectSources`, and `assembleHybridDirectFrame`.
- Workers accept `INSTALL_STATIC`, `COMPUTE_SHARD`, and `DISPOSE`; shard responses include request ID, fingerprint, revision, source results, and measured compute time.

- [ ] Write failing tests proving serial frames equal arbitrarily ordered shard assembly for direct, portal, blocked, and reflected cases.
- [ ] Write failing tests rejecting missing, duplicate, unknown, wrong-revision, and wrong-fingerprint shard results.
- [ ] Refactor the serial functions to call the same per-source seam so they remain the regression oracle.
- [ ] Implement persistent static-context installation and compact shard calculation in both worker entry points.
- [ ] Verify focused tests with `pnpm test -- compute-frame hybrid3d-direct hybrid-direct-worker classic-source-worker`.
- [ ] Commit as `refactor(acoustics): expose deterministic source shards`.

### Task 2: Add the Classic 2.5D persistent Worker Pool

**Files:**
- Create: `src/workers/worker-pool-policy.ts`
- Create: `src/workers/classic-source-pool.ts`
- Modify: `src/hooks/useAcousticFrame.ts`
- Modify: `src/components/workspace/ClassicViewportAdapter.tsx`
- Modify: `src/components/workspace/WorkspaceStatusBar.tsx`
- Test: `tests/unit/classic-source-pool.test.ts`
- Test: `tests/unit/use-acoustic-frame.test.ts`
- Test: `tests/unit/transport.test.ts`

**Interfaces:**
- `selectAcousticWorkerCapacity(hardwareConcurrency?: number): number` returns 1–4 with two logical cores reserved when possible.
- `ClassicSourcePoolClient` owns workers, static installation, source sharding, atomic merge, coalescing, disposal, and complete serial fallback.
- `AcousticFrameMetrics` retains `computeMs` and adds `workerCount` plus optional aggregate shard timing.

- [ ] Write failing policy, parallel dispatch, reverse-completion, stale revision, failure, cleanup, and source-count-change tests.
- [ ] Implement a persistent pool and compact pose dispatch without changing `AcousticFrame` output.
- [ ] Integrate the pool into `useAcousticFrame` while retaining requestAnimationFrame coalescing and rate-limited serial fallback.
- [ ] Expose active worker count only in the Debug/status area so the user can verify multicore operation.
- [ ] Verify focused tests with `pnpm test -- classic-source-pool use-acoustic-frame transport classic-baseline-capture`.
- [ ] Commit as `feat(acoustics): parallelize classic sources`.

### Task 3: Add the Hybrid 3D persistent Worker Pool

**Files:**
- Create: `src/workers/hybrid-direct-pool.ts`
- Modify: `src/hooks/useHybridDirectPaths.ts`
- Modify: `src/components/workspace/HybridViewportAdapter.tsx`
- Test: `tests/unit/hybrid-direct-pool.test.ts`
- Test: `tests/unit/hybrid-direct-worker.test.ts`
- Test: `tests/unit/hybrid-path-overlay.test.ts`
- Test: `tests/unit/hybrid3d-audible-direct.test.ts`

**Interfaces:**
- `HybridDirectPoolClient` installs the already-compiled static BVH clone once per worker and sends compact pose/source shards thereafter.
- The public `HybridDirectFrame` and downstream audio/overlay contracts remain unchanged.
- State reports pool wall time and active worker count; all worker error responses activate the deterministic fallback.

- [ ] Write failing pool tests for 1–4 workers, reverse completion, authored ordering, stale suppression, geometry reinstall, pose-only reuse, all failure paths, and cleanup.
- [ ] Implement deterministic sharding and complete-frame assembly with at most one in-flight job and one latest pending snapshot.
- [ ] Replace the singleton Hybrid worker hook with the pool client and retain the revision plus projection-hash UI acceptance guard.
- [ ] Verify focused Hybrid tests with `pnpm test -- hybrid-direct-pool hybrid-direct-worker hybrid-path-overlay hybrid3d-audible-direct`.
- [ ] Commit as `feat(acoustics): parallelize hybrid sources`.

### Task 4: Document the architecture deviation and run release verification

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISION_LOG.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/ACCEPTANCE_TESTS.md`
- Modify: `README.md`
- Test: `tests/e2e/workspace.spec.ts`

**Interfaces:**
- Debug status must expose the active worker count without adding unsupported physical-accuracy claims.
- Performance acceptance retains p95 Worker time below 12 ms and no interaction long task above 50 ms in the bounded fixture.

- [ ] Record that the earlier single-Worker architecture is superseded by a bounded source-sharded pool authorized on 2026-07-21.
- [ ] Add an automated browser assertion that a multi-source scene reports at least two active workers when Chromium exposes sufficient logical cores, otherwise reports the deterministic single-worker result.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm build`, and `git diff --check`.
- [ ] Commit as `docs(acoustics): record multicore worker architecture`.
