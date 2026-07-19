# Viewport Pan and Frame Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent modelling-style pan, cursor-anchored zoom, Home, and Frame All controls to the Classic 2.5D and Hybrid 3D viewports without changing authored geometry or acoustic revisions.

**Architecture:** Extend the per-mode presentation camera with finite virtual-pixel pan. Put reversible 2D and 3D projection math in pure utilities, then let each viewport own transient pointer capture while adapters persist camera changes through `SET_VIEW_STATE`. Frame All derives a bounded camera from enabled projected scene bounds.

**Tech Stack:** React 19 pointer events, SVG, TypeScript strict mode, Vitest, Playwright, Next.js App Router.

## Global Constraints

- Middle-button drag pans from any viewport target.
- Shift + left-button pans only from empty space; Shift + left-button on a Hybrid object keeps Y-height editing.
- Wheel zoom must not scroll the document.
- Camera changes persist independently per mode and never enter Undo/Redo or increment the acoustic scene revision.
- Home restores default camera values; Frame All fits enabled room and objects with visual padding.
- Wall placement remains available through unmodified left click after pan and zoom.

---

### Task 1: Persistent camera and projection math

**Files:**
- Modify: `src/domain/workspace/types.ts`
- Modify: `src/domain/workspace/defaults.ts`
- Modify: `src/domain/workspace/persistence.ts`
- Modify: `src/components/lab/viewport-math.ts`
- Create: `src/components/workspace/classic-viewport-math.ts`
- Modify: `tests/unit/viewport-math.test.ts`
- Modify: `tests/unit/workspace-persistence.test.ts`
- Create: `tests/unit/classic-viewport-math.test.ts`

**Interfaces:**
- Produces: `WorkspaceCamera` / `ViewportCamera` with `panX` and `panY`.
- Produces: `projectClassicPoint`, `unprojectClassicPoint`, `clampClassicCamera`, and `frameClassicBounds`.
- Produces: `frameViewportPoints(points, camera)` for Hybrid Frame All.

- [ ] **Step 1: Write failing camera round-trip and migration tests**

```ts
expect(unprojectClassicPoint(projectClassicPoint(point, bounds, camera), bounds, camera)).toEqualCloseTo(point);
expect(unprojectViewportPointAtHeight(projectViewportPoint(point, camera), point.y, camera)).toEqualCloseTo(point);
expect(migrated.view.camera).toMatchObject({ panX: 0, panY: 0 });
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm test tests/unit/classic-viewport-math.test.ts tests/unit/viewport-math.test.ts tests/unit/workspace-persistence.test.ts`

Expected: failures for absent pan fields and missing Classic camera functions.

- [ ] **Step 3: Implement finite pan-aware camera math**

```ts
export type WorkspaceCamera = Readonly<{
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
  panX: number;
  panY: number;
}>;

export function projectClassicPoint(point: Vec2, bounds: Rect, camera: WorkspaceCamera): Vec2;
export function unprojectClassicPoint(point: Vec2, bounds: Rect, camera: WorkspaceCamera): Vec2;
export function frameViewportPoints(points: readonly ViewportVec3[], camera: ViewportCamera): ViewportCamera;
```

Projection applies centre-based zoom followed by pan; inverse projection removes pan and zoom in reverse order. Clamp zoom to a finite envelope that can fit a 50 m room. Persistence schema makes pan optional during migration and writes explicit zero defaults.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm test tests/unit/classic-viewport-math.test.ts tests/unit/viewport-math.test.ts tests/unit/workspace-persistence.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/domain/workspace src/components/lab/viewport-math.ts src/components/workspace/classic-viewport-math.ts tests/unit
git commit -m "feat(viewport): add persistent pan camera math"
```

### Task 2: Classic 2.5D navigation

**Files:**
- Modify: `src/components/workbench/SceneEditor.tsx`
- Modify: `src/components/workspace/ClassicViewportAdapter.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/workspace.spec.ts`
- Modify: `tests/e2e/workspace-geometry.spec.ts`

**Interfaces:**
- Consumes: Task 1 Classic projection helpers and `WorkspaceCamera`.
- Produces: `SceneEditor` callbacks `onCameraChange`, `onHomeView`, and `onFrameAll` through adapter state.

- [ ] **Step 1: Add failing Classic browser tests**

```ts
await canvas.dispatchEvent("pointerdown", { button: 1, pointerId: 7, clientX: 400, clientY: 300 });
await canvas.dispatchEvent("pointermove", { buttons: 4, pointerId: 7, clientX: 470, clientY: 340 });
expect(await canvas.getAttribute("data-camera")).not.toBe(before);
await expect(source).toHaveAttribute("data-position", sourceBefore);
```

Also assert Shift + left empty-space pan, wheel containment, Home, Frame All, refresh persistence, and wall placement after navigation.

- [ ] **Step 2: Run focused Classic E2E and verify RED**

Run: `pnpm build && pnpm exec playwright test tests/e2e/workspace.spec.ts tests/e2e/workspace-geometry.spec.ts --grep "Classic.*(pan|Frame|navigation)"`

Expected: failures because Classic exposes no camera navigation.

- [ ] **Step 3: Implement Classic pan and cursor-anchored zoom**

```ts
type ViewDrag = Readonly<{ pointerId: number; start: Vec2; camera: WorkspaceCamera }>;

const isPanStart = event.button === 1 || (event.button === 0 && event.shiftKey);
onCameraChange({ ...drag.camera, panX: drag.camera.panX + dx, panY: drag.camera.panY + dy });
```

Replace every Classic render and pointer conversion with Task 1 transform helpers. Install a non-passive wheel listener on the viewport container, preserve the world point beneath the cursor while changing zoom, and stop pan on pointer up/cancel/lost capture. Empty unmodified click remains Wall placement.

- [ ] **Step 4: Add Home and Frame All buttons and concise help**

Home dispatches the Classic default camera. Frame All dispatches `frameClassicBounds` for the room and enabled scene bounds. CSS uses `cursor: grab` and `cursor: grabbing` without changing object cursors.

- [ ] **Step 5: Run focused Classic tests and verify GREEN**

Run the command from Step 2.

Expected: all selected Classic E2E tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/components/workbench/SceneEditor.tsx src/components/workspace/ClassicViewportAdapter.tsx src/app/globals.css tests/e2e
git commit -m "feat(viewport): add Classic pan and framing"
```

### Task 3: Hybrid 3D navigation

**Files:**
- Modify: `src/components/lab/HybridSpatialViewport.tsx`
- Modify: `src/components/workspace/HybridViewportAdapter.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/workspace.spec.ts`
- Modify: `tests/e2e/workspace-geometry.spec.ts`

**Interfaces:**
- Consumes: Task 1 pan-aware Hybrid projection and `frameViewportPoints`.
- Produces: empty-space orbit/pan discrimination and middle-button pan that overrides object manipulation.

- [ ] **Step 1: Add failing Hybrid gesture tests**

```ts
await object.dispatchEvent("pointerdown", { button: 1, pointerId: 8, clientX: 600, clientY: 360 });
await object.dispatchEvent("pointermove", { buttons: 4, pointerId: 8, clientX: 660, clientY: 390 });
await expect(object).toHaveAttribute("data-position", positionBefore);
await expect(viewport).not.toHaveAttribute("data-camera", cameraBefore);
```

Assert Shift + left empty pan, ordinary empty left orbit, Shift + object Y movement, Home, Frame All, and placement-mode pan suppression.

- [ ] **Step 2: Run focused Hybrid E2E and verify RED**

Run: `pnpm build && pnpm exec playwright test tests/e2e/workspace.spec.ts tests/e2e/workspace-geometry.spec.ts --grep "Hybrid.*(pan|Frame|navigation)"`

Expected: failures because middle-button and Shift-empty pan do not exist.

- [ ] **Step 3: Implement gesture priority and pan state**

```ts
type DragState =
  | Readonly<{ kind: "orbit"; pointer: ScreenPoint; camera: ViewportCamera }>
  | Readonly<{ kind: "pan"; pointer: ScreenPoint; camera: ViewportCamera }>
  | ExistingObjectAndGeometryDragStates;
```

Object handlers detect `button === 1` before selecting or moving the object and start a viewport pan. Empty-space handlers choose pan for middle button or Shift + left; otherwise they retain orbit or Wall placement. Hybrid pan updates only `panX/panY`.

- [ ] **Step 4: Implement Home and Frame All**

Collect room floor/ceiling corners, enabled object positions, Wall vertical endpoints, and Portal vertical corners. `Frame All` passes them to `frameViewportPoints`; Home resets to `DEFAULT_VIEWPORT_CAMERA`. Top and Front reset pan while retaining their declared rotation.

- [ ] **Step 5: Run focused Hybrid tests and verify GREEN**

Run the command from Step 2.

Expected: all selected Hybrid E2E tests pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/components/lab/HybridSpatialViewport.tsx src/components/workspace/HybridViewportAdapter.tsx src/app/globals.css tests/e2e
git commit -m "feat(viewport): add Hybrid pan and framing"
```

### Task 4: Documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ACCEPTANCE_TESTS.md`
- Modify: `docs/DECISION_LOG.md`
- Modify: `docs/STATUS.md`
- Modify: this plan to mark completed steps.

**Interfaces:**
- Consumes: completed Classic and Hybrid navigation.
- Produces: final verification evidence and human test instructions.

- [ ] **Step 1: Document gestures, persistence, Home, and Frame All**

Record that camera state is presentation-only, mode-local, migrated with zero pan, and excluded from acoustic revision/history.

- [ ] **Step 2: Run complete verification**

Run: `pnpm verify`

Expected: lint, typecheck, all Vitest tests, production build, and all Chromium tests pass with exit code 0.

- [ ] **Step 3: Check the final diff and staged secret boundary**

Run: `git diff --check`, inspect `git status --short`, and confirm no `.env*` or API-key value is staged. Keep `echo-canvas-3d-extension-pack/` untracked.

- [ ] **Step 4: Commit the completed feature**

```bash
git add README.md docs src tests
git commit -m "docs(viewport): record navigation verification"
```

- [ ] **Step 5: Restart the local server for human acceptance**

Run: `pnpm dev`

Expected: `/classic` and `/lab` both return HTTP 200 and remain available for the owner's direct test.
