# Gate B Occlusion and Portal Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing direct spatial preview into a deterministic, Worker-driven acoustic approximation that audibly applies wall occlusion and routes blocked sound through explicit open portals.

**Architecture:** Pure geometry and acoustic mapping live under `src/acoustics/` and return a versioned `AcousticFrame`; a Web Worker computes frames at the scene-configured 10–15 Hz. The React client discards stale frames, passes only the latest frame to the persistent `AudioEngine`, and the engine smooths gain, low-pass, effective-distance and virtual-panner updates without allocating audio nodes.

**Tech Stack:** Next.js App Router, React, TypeScript strict, Web Worker, Web Audio API, Vitest, Playwright, pnpm.

## Global Constraints

- The product is an "interactive acoustic approximation" and uses "portal-aware sound propagation"; never call portal routing diffraction or physically accurate.
- GPT-5.6 is not involved in this Gate and must never control audio parameters.
- All authoritative geometry and acoustic functions are pure and deterministic where practical.
- Run acoustic calculations in a Worker at 10–15 Hz; discard frames whose `revision` is not the current scene revision.
- Smooth gain, filter and panner updates over approximately 60–100 ms; do not create or destroy Web Audio nodes per frame.
- Use the existing perceptually tuned material registry only; limits remain 100 walls, 8 portals, 4 sources, and 50 m room dimensions.
- Direct occlusion accumulates crossed-wall loss, caps mid-band direct loss at 24 dB, and maps high-band loss to a 700–20,000 Hz low-pass cutoff.
- Portal routing uses only open portals, a visible-node graph and Dijkstra; its virtual panner points toward the first portal seen by the listener, while manual distance uses the complete selected route.
- Keep Raw mode unprocessed. Simulated mode alone receives the `AcousticFrame` parameters.
- Every implementation task follows TDD: write one failing test, run it red, add minimal code, run it green, then run required quality checks.
- After every checklist item, run `pnpm lint`, `pnpm typecheck`, and `pnpm test`; at the Gate B integration point also run `pnpm e2e` and `pnpm build`.

---

## File structure

| Path | Responsibility |
|---|---|
| `src/acoustics/types.ts` | Stable pure types for direct traces, routes, source frames, worker frames, and debug geometry. |
| `src/acoustics/geometry.ts` | Epsilon-safe vector, segment, projection, and visibility predicates. |
| `src/acoustics/occlusion.ts` | Crossed-wall loss accumulation and gain/cutoff mapping. |
| `src/acoustics/portal.ts` | Open-portal graph construction, route selection, and portal rendering parameters. |
| `src/acoustics/compute-frame.ts` | Pure orchestration from `SceneSpec` to a versioned `AcousticFrame`. |
| `src/workers/acoustics.worker.ts` | Worker request/response handling and 12 Hz coalesced computation. |
| `src/hooks/useAcousticFrame.ts` | Browser Worker lifecycle, revision filtering, and main-thread deterministic fallback for test/unsupported cases. |
| `src/audio/AudioEngine.ts` | Receive a latest `AcousticFrame` and apply it to existing source graphs. |
| `src/audio/SourceGraph.ts` | Persistent low-pass and frame-driven direct gain/effective distance/virtual position updates. |
| `src/audio/types.ts` | Minimal `BiquadFilterNode` test/browser contract. |
| `src/components/workbench/SceneEditor.tsx` | Render direct/portal route and blocked-wall debug overlays from the latest frame. |
| `src/components/workbench/ReadoutStrip.tsx` | Display actual frame route, occluders, effective distance, direct level, and cutoff. |
| `src/components/workbench/EchoWorkbench.tsx` | Create frame hook, pass frame to audio and visual components. |
| `tests/unit/*.test.ts` | TDD coverage for pure geometry, occlusion, portal routing, worker revision behavior, and frame-to-audio mapping. |
| `tests/e2e/portal.spec.ts` | Production-browser Gate B flow and truthful UI terminology. |
| `docs/STATUS.md` / `docs/DECISION_LOG.md` | Record Gate A pass, Gate B verification, limitations, and any formula deviation before implementation. |

## Task 1: Deterministic geometry, direct tracing, and occlusion mapping

**Files:**
- Create: `src/acoustics/types.ts`
- Create: `src/acoustics/geometry.ts`
- Create: `src/acoustics/occlusion.ts`
- Create: `tests/unit/geometry.test.ts`
- Create: `tests/unit/occlusion.test.ts`
- Modify: `docs/STATUS.md`
- Modify: `docs/BUILD_CHECKLIST.md`

**Interfaces:**
- Produces `traceDirectPath(source: Vec2, listener: Vec2, scene: SceneSpec): DirectTrace` where `DirectTrace` contains `visible`, sorted `crossings`, and `polyline: readonly Vec2[]`.
- Produces `estimateDirectOcclusion(trace: DirectTrace): OcclusionEstimate` where `OcclusionEstimate` contains `dryGainDb`, `lowpassHz`, `occluderWallIds`, and three-band accumulated transmission loss.
- `DirectTrace.crossings` excludes intersections occurring inside an attached open portal, but includes ordinary wall intersections and closed portals.

- [ ] **Step 1: Write failing geometry tests**

```ts
it("returns the ordered finite intersections for a direct segment", () => {
  const hits = intersectSegmentWithWalls({ x: 0, y: 4 }, { x: 12, y: 4 }, scene.walls);
  expect(hits.map((hit) => hit.wallId)).toEqual(["partition_center"]);
  expect(hits[0]?.point).toEqual({ x: 6, y: 4 });
});

it("treats an open attached portal as a gap but a closed portal as an obstruction", () => {
  expect(traceDirectPath(source, listener, openPortalScene).visible).toBe(true);
  expect(traceDirectPath(source, listener, closedPortalScene).visible).toBe(false);
});
```

- [ ] **Step 2: Run the geometry tests red**

Run: `pnpm test -- geometry`

Expected: FAIL because `src/acoustics/geometry.ts` and direct tracing do not yet exist.

- [ ] **Step 3: Implement epsilon-safe finite segment and portal-gap predicates**

```ts
export const ACOUSTIC_EPSILON = 1e-8;

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): SegmentHit | null {
  // Return null for parallel/collinear segments and return only t,u within epsilon-adjusted [0,1].
}
```

Use the existing `portal.center`, `portal.widthM`, and host wall direction to compute its finite opening segment. Ignore only a hit that lies within an **open** portal segment on the crossed host wall; do not ignore boundary endpoints or unrelated wall contacts.

- [ ] **Step 4: Write failing occlusion mapping tests**

```ts
it("keeps a visible source at 0 dB occlusion and 20000 Hz", () => {
  expect(estimateDirectOcclusion({ visible: true, crossings: [], polyline: [source, listener] }))
    .toMatchObject({ dryGainDb: 0, lowpassHz: 20_000, occluderWallIds: [] });
});

it("caps concrete direct loss and lowers the high-frequency cutoff", () => {
  const estimate = estimateDirectOcclusion(traceWithConcreteCrossing);
  expect(estimate.dryGainDb).toBe(-24);
  expect(estimate.lowpassHz).toBeLessThan(2_000);
  expect(estimate.occluderWallIds).toEqual(["partition_center"]);
});
```

- [ ] **Step 5: Run the occlusion tests red**

Run: `pnpm test -- occlusion`

Expected: FAIL because `estimateDirectOcclusion` does not exist.

- [ ] **Step 6: Implement material-aware loss and low-pass mapping**

```ts
const MAX_DIRECT_LOSS_DB = 24;
const MIN_CUTOFF_HZ = 700;
const MAX_CUTOFF_HZ = 20_000;

const effectiveThicknessM = wall.thicknessM / Math.max(Math.abs(dot(direction, wallNormal)), 0.25);
const thicknessAdjustmentDb = 6 * Math.log2(effectiveThicknessM / material.referenceThicknessM);
const highObstruction = clamp(totalLoss.high / 36, 0, 1);
const lowpassHz = MIN_CUTOFF_HZ * (MAX_CUTOFF_HZ / MIN_CUTOFF_HZ) ** (1 - highObstruction);
```

Compute low/mid/high adjusted loss for every crossing. Use `-Math.min(totalLoss.mid, MAX_DIRECT_LOSS_DB)` for `dryGainDb`; preserve unclamped per-band diagnostics for the UI and later explanation.

- [ ] **Step 7: Run focused tests green, then required checks**

Run: `pnpm test -- geometry occlusion && pnpm lint && pnpm typecheck && pnpm test`

Expected: all commands exit 0; existing Gate A tests remain green.

- [ ] **Step 8: Record Gate A pass and commit Task 1**

Update `docs/STATUS.md` so Gate A is `PASS (2026-07-17)`, item 4 is complete, and the user observation states that only direct 2D position/distance was expected before Gate B. Mark items 1–4 checked in `docs/BUILD_CHECKLIST.md`.

```bash
git add src/acoustics tests/unit/geometry.test.ts tests/unit/occlusion.test.ts docs/STATUS.md docs/BUILD_CHECKLIST.md
git commit -m "feat(acoustics): add direct occlusion model"
```

## Task 2: Versioned Worker frame pipeline and persistent audio application

**Files:**
- Create: `src/acoustics/compute-frame.ts`
- Create: `src/workers/acoustics.worker.ts`
- Create: `src/hooks/useAcousticFrame.ts`
- Modify: `src/audio/types.ts`
- Modify: `src/audio/SourceGraph.ts`
- Modify: `src/audio/AudioEngine.ts`
- Modify: `src/hooks/useAudioEngine.ts`
- Create: `tests/unit/compute-frame.test.ts`
- Create: `tests/unit/acoustic-worker.test.ts`
- Modify: `tests/unit/audio-engine.test.ts`

**Interfaces:**
- `computeAcousticFrame(scene: SceneSpec, generatedAtMs = 0): AcousticFrame` returns one source frame per source with `routeType: "direct" | "blocked"`, direct/effective distance, `dryGainDb`, `lowpassHz`, `virtualPosition`, debug polylines, and empty room/reflection fields needed by later gates.
- `AudioEngine.applyAcousticFrame(frame: AcousticFrame): void` ignores revision mismatches and leaves Raw mode unaffected.
- `useAcousticFrame(scene)` posts only the newest scene snapshot and returns the latest matching frame; it must compute a deterministic main-thread fallback if Worker construction fails.

- [ ] **Step 1: Write failing frame and stale-revision tests**

```ts
it("maps an unobstructed source to a direct frame", () => {
  expect(computeAcousticFrame(visibleScene).sources[0]).toMatchObject({
    routeType: "direct", directVisible: true, dryGainDb: 0, lowpassHz: 20_000,
  });
});

it("rejects an older worker frame after a newer scene revision", () => {
  const state = acceptWorkerFrame({ revision: 8 }, { revision: 9, current: null });
  expect(state.current).toBeNull();
});
```

- [ ] **Step 2: Run frame and worker tests red**

Run: `pnpm test -- compute-frame acoustic-worker`

Expected: FAIL because the frame pipeline and revision reducer do not exist.

- [ ] **Step 3: Implement pure frame orchestration and Worker protocol**

```ts
export type AcousticWorkerRequest =
  | { type: "UPDATE_SCENE"; scene: SceneSpec }
  | { type: "DISPOSE" };

export type AcousticWorkerResponse =
  | { type: "FRAME"; revision: number; frame: AcousticFrame; metrics: WorkerMetrics }
  | { type: "ERROR"; revision: number; code: string; message: string };
```

The Worker must coalesce a burst of scene messages, compute at no more than `scene.settings.acousticUpdateHz`, and post frame timing. It must not access DOM, Web Audio, or React state.

- [ ] **Step 4: Write failing audio-frame mapping test**

```ts
it("applies blocked-frame direct gain, filter, route distance, and virtual panner position without creating another graph", async () => {
  await engine.start(scene);
  engine.applyAcousticFrame(blockedFrame);
  expect(context.gains).toContainEqual(expect.objectContaining({ gain: expect.anything() }));
  expect(context.filters[0]?.frequency.targets.at(-1)?.target).toBe(blockedFrame.sources[0]?.lowpassHz);
  expect(engine.getDiagnostics().sourceStarts).toBe(2);
});
```

- [ ] **Step 5: Run the audio-frame test red**

Run: `pnpm test -- audio-engine`

Expected: FAIL because the persistent graph has no filter or frame-application API.

- [ ] **Step 6: Add a persistent low-pass to each simulated source path**

```text
sourceGain → rawModeGain → output
sourceGain → distanceGain → lowPass → panner → simulatedModeGain → output
```

Add only the required `BiquadFilterNode` interface members (`type`, `frequency`) and create the filter in `SourceGraph` constructor. Set it to `lowpass`, initialize at `20_000 Hz`, and use existing `smoothParameter` for all frame changes. `SourceGraph.applyFrame(sourceFrame, now)` must use `effectiveDistanceM` for manual gain and `virtualPosition - listener.position` for panner coordinates. Do not recreate graphs/nodes or restart buffers.

- [ ] **Step 7: Wire Worker output through React and AudioEngine**

Call `useAcousticFrame(state.scene)` in `EchoWorkbench`; pass matching frames to `useAudioEngine` and then `AudioEngine.applyAcousticFrame`. Keep `applyScene` for source/listener topology and use the acoustic frame only for dynamic simulated parameters. On unavailable Worker, call `computeAcousticFrame` in the hook and display a non-blocking fallback notice in diagnostics.

- [ ] **Step 8: Run focused tests green, then required checks**

Run: `pnpm test -- compute-frame acoustic-worker audio-engine && pnpm lint && pnpm typecheck && pnpm test`

Expected: all commands exit 0; source starts remain constant across repeated matching frames.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/acoustics/compute-frame.ts src/workers/acoustics.worker.ts src/hooks/useAcousticFrame.ts src/audio tests/unit
git commit -m "feat(acoustics): apply worker occlusion frames"
```

## Task 3: Open-portal visibility graph, route selection, and perceptual mapping

**Files:**
- Create: `src/acoustics/portal.ts`
- Modify: `src/acoustics/types.ts`
- Modify: `src/acoustics/compute-frame.ts`
- Create: `tests/unit/portal.test.ts`

**Interfaces:**
- `findBestPortalRoute(source: Vec2, listener: Vec2, scene: SceneSpec): PortalRoute | null` uses source, listener, and open portal centers as graph nodes.
- `PortalRoute` contains `portalIds`, `polyline`, `effectiveDistanceM`, `cost`, `virtualPosition`, `dryGainDb`, and `lowpassHz`.
- A direct-visible source must stay `routeType: "direct"`; when direct is blocked, choose a valid portal route or `routeType: "blocked"`.

- [ ] **Step 1: Write failing portal graph tests**

```ts
it("routes a blocked source through the one visible open portal", () => {
  const route = findBestPortalRoute(source, listener, openPortalScene);
  expect(route?.portalIds).toEqual(["partition_door"]);
  expect(route?.polyline).toEqual([source, { x: 6, y: 4 }, listener]);
  expect(route?.virtualPosition).toEqual({ x: 6, y: 4 });
});

it("returns null when that portal is closed", () => {
  expect(findBestPortalRoute(source, listener, closedPortalScene)).toBeNull();
});

it("chooses the lowest-cost visible route deterministically when two portals are available", () => {
  expect(findBestPortalRoute(source, listener, twoPortalScene)?.portalIds).toEqual(["near_door"]);
});
```

- [ ] **Step 2: Run portal tests red**

Run: `pnpm test -- portal`

Expected: FAIL because portal routing does not yet exist.

- [ ] **Step 3: Implement the tiny deterministic graph and Dijkstra selection**

```ts
const edgeCost = (distanceM: number, portalLossDb: number, turnRadians: number) =>
  distanceM + 0.08 * portalLossDb + 0.25 * turnRadians * turnRadians;
```

Build edges only when `traceDirectPath` says the segment is visible while treating its endpoint open portal as a permitted gap. Store nodes in stable ID order and tie-break equal costs by lexical portal-ID sequence. Accumulate portal `lossDb` in amplitude dB, use full route length for manual distance, set `virtualPosition` to the portal closest to the listener, and apply a centralized mild portal low-pass penalty of 1,500 Hz per portal clamped to 1,200–20,000 Hz.

- [ ] **Step 4: Integrate route selection into the frame tests**

```ts
it("uses portal direction and total route distance only after direct visibility is blocked", () => {
  const sourceFrame = computeAcousticFrame(openPortalScene).sources[0]!;
  expect(sourceFrame).toMatchObject({
    routeType: "portal", directVisible: false, portalIds: ["partition_door"],
    virtualPosition: { x: 6, y: 4 },
  });
  expect(sourceFrame.effectiveDistanceM).toBeGreaterThan(sourceFrame.physicalDistanceM);
});
```

- [ ] **Step 5: Run portal and frame tests green, then required checks**

Run: `pnpm test -- portal compute-frame && pnpm lint && pnpm typecheck && pnpm test`

Expected: all commands exit 0; no direct-visible scene uses a portal route.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/acoustics/portal.ts src/acoustics/types.ts src/acoustics/compute-frame.ts tests/unit/portal.test.ts tests/unit/compute-frame.test.ts
git commit -m "feat(acoustics): add portal-aware routing"
```

## Task 4: Truthful Gate B diagnostics, overlays, production E2E, and handoff

**Files:**
- Modify: `src/components/workbench/EchoWorkbench.tsx`
- Modify: `src/components/workbench/SceneEditor.tsx`
- Modify: `src/components/workbench/ReadoutStrip.tsx`
- Modify: `src/components/workbench/Inspector.tsx`
- Modify: `src/components/workbench/Transport.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/e2e/portal.spec.ts`
- Modify: `docs/STATUS.md`
- Modify: `docs/DECISION_LOG.md`
- Modify: `docs/ACCEPTANCE_TESTS.md`

**Interfaces:**
- UI consumes a nullable `AcousticFrame`; while null it says `Computing acoustic preview…`, never inventing a route.
- The selected source frame supplies all shown route/occluder/effective-distance/low-pass data and all SVG debug paths.

- [ ] **Step 1: Write failing production-browser test**

```ts
test("a concrete partition becomes an occluded portal route when its door is open", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Audio" }).click();
  await page.getByRole("button", { name: "Simulated" }).click();
  await expect(page.getByText("Route")).toBeVisible();
  await expect(page.getByText("Portal route")).toBeVisible();
  await expect(page.getByText(/partition_center/)).toBeVisible();
  await page.getByTestId("portal-partition_door").click();
  await page.getByRole("switch", { name: "Portal open" }).click();
  await expect(page.getByText("Blocked fallback")).toBeVisible();
  await expect(page.getByText(/portal-aware sound propagation/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the Gate B browser test red**

Run: `pnpm e2e --grep "occluded portal route"`

Expected: FAIL because Gate A does not render route/occluder/cutoff diagnostics or overlay paths.

- [ ] **Step 3: Render frame-driven diagnostics and overlays**

Draw the selected source `routePolyline` as a cyan dashed route, crossed walls as red highlighted segments, and the first portal as a distinct cyan marker. The readout must label `Direct`, `Portal route`, or `Blocked fallback`; show `Effective distance`, `Direct gain`, `Low-pass`, and `Occluders`. The portal inspector must say exactly: `Portal-aware sound propagation is an interactive acoustic approximation; it is not diffraction.`

- [ ] **Step 4: Add accessible audio/worker status and avoid false precision**

Expose the current frame revision and Worker timing in the existing diagnostics element. Use `aria-live="polite"` for route changes. Keep material coefficients out of the primary UI; state that material choices are perceptually tuned presets. If there is no route frame yet, show a pending state rather than Gate A's hard-coded `Direct preview`.

- [ ] **Step 5: Run browser test green, then full integration verification**

Run: `pnpm e2e --grep "occluded portal route" && pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build`

Expected: focused and full production E2E pass; all Gate A tests stay green; build exits 0.

- [ ] **Step 6: Update Gate B handoff documents and commit**

Record actual test counts/commands in `docs/STATUS.md`, preserve the explicit limitation that the model is not architectural acoustics, and replace the Gate B script with the exact five manual steps from `docs/ACCEPTANCE_TESTS.md`. Add a decision-log entry only if an implementation deviates from the centralized constants above.

```bash
git add src/components src/app/globals.css tests/e2e/portal.spec.ts docs/STATUS.md docs/DECISION_LOG.md docs/ACCEPTANCE_TESTS.md
git commit -m "feat(ui): expose Gate B acoustic diagnostics"
```

## Final verification and human handoff

- [ ] Generate a review package from `git merge-base origin/main HEAD` to `HEAD`, obtain an independent whole-branch review, and resolve all Critical/Important findings with focused tests.
- [ ] Run fresh `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`, and `pnpm build` after the final review fix.
- [ ] Update `.superpowers/sdd/progress.md` with Task 1–4 commits and review verdicts.
- [ ] Start `pnpm start --hostname 127.0.0.1 --port 3000` and provide Human Gate B with the local URL, five exact headset test steps, expected results, fresh automated evidence, known deviations, and a single `PASS` / `FAIL` request.
