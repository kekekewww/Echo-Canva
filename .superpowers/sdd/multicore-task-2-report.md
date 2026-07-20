# Classic Multicore Task 2 Report

## Implementation commit

`079d09f480ab5a8a5d1d90aa15b1f8a8ae84493a` — `feat(acoustics): parallelize classic sources`

## Files

- `src/workers/worker-pool-policy.ts`
- `src/workers/classic-source-pool.ts`
- `src/hooks/useAcousticFrame.ts`
- `src/workers/acoustics.worker.ts`
- `src/components/workspace/ClassicViewportAdapter.tsx`
- `src/components/workspace/HybridViewportAdapter.tsx`
- `src/components/workspace/WorkspaceStatusBar.tsx`
- `tests/unit/classic-source-pool.test.ts`
- `tests/unit/use-acoustic-frame.test.ts`
- `tests/unit/workspace-status-bar.test.ts`
- `.superpowers/sdd/multicore-task-2-report.md`

`echo-canvas-3d-extension-pack/` was neither touched nor staged.

## Design decisions

- The browser-facing Classic implementation remains an `AcousticWorkerLike` facade, so `AcousticFrameClient` retains its existing request, coalescing, RAF, error, and serial-fallback behavior.
- Pool capacity is isolated in a pure policy function and is clamped to 1–4 while reserving two logical cores when valid hardware concurrency permits.
- Workers are created only as the active authored source count grows, persist across frames, and receive deterministic authored-index round-robin shards.
- Each Worker tracks its last installed static fingerprint. Pose-only frames send only `COMPUTE_SHARD`; static changes post `INSTALL_STATIC` immediately before the new shard request.
- One aggregate job is allowed in flight. Edits overwrite one pending scene, obsolete completed aggregates are suppressed, and the newest scene is scheduled at the existing clamped 10–15 Hz cadence.
- Room acoustics are estimated once per aggregate job. Shards are strictly validated, flattened by Worker assignment, and passed through `assembleAcousticFrame`, which restores authored source order and enforces result invariants.
- Pool timing starts at aggregate dispatch and ends after the final merge. Metrics add active Worker count and max/total shard compute duration as optional fields for backward compatibility.
- All fatal paths share one fail-closed shutdown: cancel timers, clear pending/in-flight state, terminate every Worker once, emit one old-shape `ERROR`, and let `AcousticFrameClient` activate complete serial fallback.
- Hybrid runtime behavior is unchanged; its existing status payload only supplies nulls for the new Classic pool status fields.

## TDD evidence

### RED

- Capacity policy: missing `worker-pool-policy` module.
- Initial pool dispatch: missing `classic-source-pool` module.
- Reverse completion: no aggregate frame emitted.
- Static reuse: pose-only update posted a second static install (`[2, 2]` versus `[1, 1]`).
- In-flight coalescing: a second shard job was dispatched before the first completed (`[2, 2]` versus `[1, 1]`).
- Cadence: newest 10 Hz edit retained the older 15 Hz due time (`66.666...` versus `100`).
- Validation/failure/disposal: ten tests failed before the unified fail-closed path existed.
- Metric forwarding: `AcousticFrameClient` dropped Worker count and shard timings.
- Status metrics: formatter did not exist.
- Wall latency self-review regression: generated time began after Worker construction (`108` versus `100`) and reported `12 ms` instead of `20 ms`.

### GREEN

Pure pool suite after the final TDD cycle:

```text
Test Files  1 passed (1)
Tests  27 passed (27)
```

Focused integration suite:

```text
$ vitest run "--" "classic-source-pool" "use-acoustic-frame" "acoustic-worker" "transport" "classic-baseline-capture"
Test Files  66 passed (66)
Tests  420 passed (420)
```

## Final verification

```text
$ eslint . --max-warnings=0
exit 0

$ tsc --noEmit
exit 0

$ vitest run
Test Files  66 passed (66)
Tests  420 passed (420)
exit 0

$ next build
Compiled successfully
Finished TypeScript
Generating static pages (8/8)
exit 0
```

No tests were skipped, commented out, or inferred manually.

## Self-review

- Confirmed exact serial equality under reverse Worker completion and authored source ordering after 1→4→2 active-source changes.
- Confirmed pool construction is lazy and persistent, static installs are fingerprint-gated, and four sources shard `[0,2]` / `[1,3]` at two-Worker capacity.
- Confirmed wrong request, revision, fingerprint, assignment, typed Worker error, `onerror`, `onmessageerror`, constructor failure, and assembly failure emit one complete error and terminate all Workers.
- Confirmed `DISPOSE` posts Worker disposal, terminates once, cancels state, and ignores late messages.
- Confirmed existing fallback timing shape and Transport formatting remain valid.
- Confirmed the production Next.js build recognizes and bundles the Classic source Worker URL.

## Concerns

None. No formulas, public `AcousticFrame` fields, reflection limits, Web Audio behavior, or Hybrid acoustic calculations changed.

## Review hardening follow-up

Implementation commit: `517f8fd6bec9846931bc632dfbcc9a20c232f8be` — `fix(acoustics): harden classic pool fallback`

### Fixes

- Reverted all Task 2 runtime edits in `HybridViewportAdapter`; pool metrics are optional Classic-only status fields.
- Treats shard Worker messages as untrusted values. Arrays, result records, nested frame fields, vectors, reflection taps, string collections, and numeric values are validated before aggregation.
- Wraps the complete message validation path in `try/catch`; malformed values terminate all Workers and emit exactly one backward-compatible pool `ERROR`.
- Classic accepts and applies a complete deterministic serial-fallback frame, reports `Fallback`, and retains the fallback notice in the viewport UI.

### Follow-up RED evidence

- `sourceIds: null` and `results: null` threw `TypeError` through the Worker event callback.
- Null result and null nested frame values threw while reading `sourceId`.
- A nested `physicalDistanceM: NaN` was published in a completed `FRAME`.
- The Classic fallback presentation mapping did not exist.
- A Hybrid-style `WorkspaceAcousticStatus` without pool metrics failed typecheck.

### Follow-up GREEN verification

```text
$ vitest run tests/unit/classic-source-pool.test.ts tests/unit/use-acoustic-frame.test.ts tests/unit/classic-viewport-adapter.test.ts tests/unit/workspace-status-bar.test.ts tests/unit/transport.test.ts
Test Files  5 passed (5)
Tests  43 passed (43)

$ eslint . --max-warnings=0
exit 0

$ tsc --noEmit
exit 0

$ vitest run
Test Files  67 passed (67)
Tests  426 passed (426)
exit 0
```

Follow-up concerns: none.
