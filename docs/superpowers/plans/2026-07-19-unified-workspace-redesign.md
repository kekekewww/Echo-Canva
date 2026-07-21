# Unified Modelling Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one modelling-style Echo Canvas workspace with independent cached 2.5D and 3D projects, contextual authoring controls, multiple selectable listeners, dynamic/local sources, editable 3D room geometry, reversible surface disabling, and matched-frame 3D acoustic path overlays.

**Architecture:** Add a versioned authoring-project layer above the unchanged Classic `SceneSpec` and Hybrid `SceneDocumentV2` engine contracts. A single client workspace owns two independent project reducers and selects a mode adapter that projects the active listener and enabled geometry into the existing deterministic workers and persistent Web Audio engine. Shared Outliner, Inspector, numeric scrub fields, toolbar, hint cards, and persistence operate on adapter-neutral commands.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Zod, Web Audio, Web Workers, localStorage, IndexedDB, Vitest, Playwright.

## Global Constraints

- Keep 2.5D and 3D project contents independent; switching mode must not convert or overwrite either project.
- Preserve the existing Classic acoustic formulas and current Hybrid first-order solver contracts.
- Maximum 100 walls, 8 portals, 4 sources, and 8 listeners per mode; at least one enabled listener.
- Maximum room dimension 50 m and minimum wall length 0.1 m.
- Exactly one Active Listener drives audio and acoustic calculation.
- Floor cannot be disabled; disabling another surface removes it from viewport and acoustic compilation while retaining authoring data.
- Local audio stays browser-side, accepts browser-decodable WAV/MP3/Ogg up to 25 MB each and 100 MB total, and never reaches a server route.
- 3D path overlays must consume the same accepted Worker revision used by audio.
- Use “interactive acoustic approximation”, “portal-aware sound propagation”, “first-order early reflections”, and “browser HRTF rendering”.
- Do not enable second-order, directional-late, diffraction, FDTD, or other research branches.
- After every task run `pnpm lint`, `pnpm typecheck`, and `pnpm test`; integration tasks also run `pnpm e2e` and `pnpm build`.

---

### Task 1: Versioned authoring projects and engine projections

**Files:**
- Create: `src/domain/workspace/types.ts`
- Create: `src/domain/workspace/defaults.ts`
- Create: `src/domain/workspace/project-reducer.ts`
- Create: `src/domain/workspace/projections.ts`
- Test: `tests/unit/workspace-project.test.ts`
- Test: `tests/unit/workspace-projections.test.ts`

**Interfaces:**
- Produces `WorkspaceMode`, `WorkspaceSelection`, `AuthoringListener`, `AuthoringProject2D5D`, `AuthoringProject3D`, `WorkspaceCommand`, `projectReducer`, `projectClassicScene`, and `projectHybridDocument`.
- Consumes validated presets, `SceneSpec`, `SceneDocumentV2`, and existing Hybrid geometry constraints.

- [x] **Step 1: Write failing project-model tests**

```ts
const project = createDefaultClassicProject();
expect(project.listeners).toHaveLength(1);
expect(project.activeListenerId).toBe(project.listeners[0]!.id);
expect(projectReducer(project, { type: "ADD_LISTENER" }).listeners).toHaveLength(2);
expect(projectReducer(project, { type: "DISABLE_ENTITY", id: "floor" })).toBe(project);
```

- [x] **Step 2: Run the tests red**

Run: `pnpm test -- workspace-project workspace-projections`

Expected: FAIL because the workspace modules do not exist.

- [x] **Step 3: Define authoring contracts and defaults**

```ts
export type WorkspaceMode = "classic-2d5d" | "hybrid-3d";
export type AuthoringListener = {
  id: string; name: string; position: { x: number; y: number; z: number };
  headingDeg: number; enabled: boolean;
};
export type AuthoringWall3D = {
  id: string; name: string; a: Vec2; b: Vec2; thicknessM: number;
  bottomM: number; topM: number; materialId: string; enabled: boolean;
};
export type AuthoringPortal3D = {
  id: string; name: string; hostWallId: string; offsetM: number; widthM: number;
  bottomM: number; topM: number; thicknessM: number; open: boolean; enabled: boolean;
};
```

Create default projects by migrating `CONCRETE_PARTITION_PRESET`; 2.5D uses X/Z with `y = 0`, and 3D uses the current `12 × 8 × 3 m` fixture.

- [x] **Step 4: Implement immutable commands and invariants**

Implement explicit command cases for select, add/delete listener, set active listener, add/delete source, add/delete wall, add/delete Portal, update transform/dimensions, toggle enable/open, resize room, replace project, and reset. Increment revision only for scene changes. Reject final-listener deletion/disable and count-limit violations with typed notices.

- [x] **Step 5: Implement engine projections**

`projectClassicScene(project)` must clone the base scene, replace `listener` with the active listener, filter disabled walls/Portals/sources, and keep attached Portals only when their host Wall is enabled.

`projectHybridDocument(project)` must produce finite floor/ceiling/wall patches through the existing V2 compiler, omit disabled surfaces, retain the active listener/source heights, and project rectangular room dimensions into the base polygon.

- [x] **Step 6: Run focused and full static checks**

Run: `pnpm test -- workspace-project workspace-projections`

Expected: PASS, including listener fallback, disabled geometry filtering, Portal dependency, dimension clamps, and immutable revision tests.

Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

- [x] **Step 7: Commit**

```bash
git add src/domain/workspace tests/unit/workspace-project.test.ts tests/unit/workspace-projections.test.ts
git commit -m "feat(workspace): add versioned authoring projects"
```

---

### Task 2: Independent persistence, history, and reset

**Files:**
- Create: `src/domain/workspace/persistence.ts`
- Create: `src/domain/workspace/history.ts`
- Create: `src/hooks/useWorkspaceProjects.ts`
- Test: `tests/unit/workspace-persistence.test.ts`
- Test: `tests/unit/workspace-history.test.ts`

**Interfaces:**
- Consumes `AuthoringProject2D5D`, `AuthoringProject3D`, and `WorkspaceCommand` from Task 1.
- Produces `loadWorkspaceCache`, `saveWorkspaceCache`, `migrateWorkspaceCache`, `HistoryState`, `reduceWithHistory`, and `useWorkspaceProjects`.

- [x] **Step 1: Write failing cache and history tests**

```ts
expect(loadWorkspaceCache(storage, "classic-2d5d")).toEqual(defaultClassic);
expect(saveWorkspaceCache(storage, "hybrid-3d", hybrid).ok).toBe(true);
expect(reduceWithHistory(history, moveCommand).past).toHaveLength(1);
expect(undo(next).present).toEqual(history.present);
expect(resetActiveMode(workspace, "classic-2d5d").hybrid).toEqual(workspace.hybrid);
```

- [x] **Step 2: Run the tests red**

Run: `pnpm test -- workspace-persistence workspace-history`

Expected: FAIL because persistence/history modules do not exist.

- [x] **Step 3: Implement versioned localStorage persistence**

Use keys `echo-canvas:project:classic:v1`, `echo-canvas:project:hybrid:v1`, and `echo-canvas:workspace-ui:v1`. Parse through Zod, never mutate unread records, and return `{ project, warning, persistenceAvailable }`. Debounce writes by 150 ms and flush on mode switch and `pagehide`.

- [x] **Step 4: Implement bounded command history**

Store at most 50 scene-changing command results. Selection, camera, panel expansion, and audio status do not enter history. Reset affects only the active project and can itself be undone during the current session.

- [x] **Step 5: Implement the project hook**

```ts
const {
  activeMode, setActiveMode, activeProject, dispatch, undo, redo,
  canUndo, canRedo, resetActiveProject, persistenceStatus,
} = useWorkspaceProjects();
```

Keep both project histories mounted. Flush before mode change. Restore the last active mode and each mode's camera/selection independently.

- [x] **Step 6: Verify and commit**

Run: `pnpm test -- workspace-persistence workspace-history`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`.

```bash
git add src/domain/workspace src/hooks/useWorkspaceProjects.ts tests/unit/workspace-*.test.ts
git commit -m "feat(workspace): persist independent mode projects"
```

---

### Task 3: Shared modelling workspace shell and numeric scrub fields

**Files:**
- Create: `src/components/workspace/UnifiedWorkspace.tsx`
- Create: `src/components/workspace/WorkspaceToolbar.tsx`
- Create: `src/components/workspace/SceneOutliner.tsx`
- Create: `src/components/workspace/ContextInspector.tsx`
- Create: `src/components/workspace/NumericScrubField.tsx`
- Create: `src/components/workspace/HintCard.tsx`
- Create: `src/components/workspace/WorkspaceStatusBar.tsx`
- Create: `src/components/workspace/ClassicViewportAdapter.tsx`
- Create: `src/components/workspace/HybridViewportAdapter.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/classic/page.tsx`
- Modify: `src/app/lab/page.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/numeric-scrub-field.test.tsx`
- Test: `tests/e2e/workspace.spec.ts`

**Interfaces:**
- Consumes `useWorkspaceProjects` and project commands from Tasks 1–2.
- Produces the single workspace route and shared UI primitives used by later authoring tasks.

- [x] **Step 1: Write failing numeric and workspace browser tests**

Cover exact input, unit suffixes, pointer scrubbing, Shift fine steps, Ctrl grid steps, arrows, Enter commit, Escape cancel, invalid-range hint, 2.5D/3D switch restoration, current-mode Reset confirmation, and fixed Outliner/Inspector regions.

- [x] **Step 2: Run the tests red**

Run: `pnpm test -- numeric-scrub-field`

Run: `pnpm exec playwright test tests/e2e/workspace.spec.ts`

Expected: FAIL because the unified workspace is absent.

- [x] **Step 3: Implement `NumericScrubField`**

```ts
type NumericScrubFieldProps = {
  label: string; axis?: "x" | "y" | "z"; value: number; unit: string;
  min: number; max: number; step: number; fineStep: number;
  onCommit(value: number): void;
};
```

Use pointer capture on the label/value surface, parse optional unit suffixes, preserve the pre-edit value until commit, and expose a native text input for keyboard/accessibility.

- [x] **Step 4: Implement the workspace shell**

Build the fixed toolbar / Outliner / viewport / Inspector / status layout. Keep persistent prose to labels only. Put shortcuts, limitations, and errors in focusable hint cards. Use amber Listener, cyan Source/Portal, coral Wall, and subdued axis accents.

- [x] **Step 5: Connect existing viewports through adapters**

Render the Classic SVG editor and Hybrid 3D viewport from the active projected project. Route selection and transform edits back through workspace commands. Preserve current acoustic overlays and audio controls while removing duplicate page mastheads/control walls.

- [x] **Step 6: Replace routes**

`/` renders `UnifiedWorkspace`. `/classic` and `/lab` render the same component with an initial-mode hint and immediately operate on the same per-mode caches; no route is allowed to own a separate scene state.

- [x] **Step 7: Verify and commit**

Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`.

```bash
git add src/app src/components/workspace tests/unit/numeric-scrub-field.test.tsx tests/e2e/workspace.spec.ts
git commit -m "feat(ui): add unified modelling workspace"
```

---

### Task 4: Multiple listeners, dynamic sources, and local audio library

**Files:**
- Create: `src/domain/audio-assets/local-library.ts`
- Create: `src/hooks/useLocalAudioLibrary.ts`
- Create: `src/components/workspace/AddObjectMenu.tsx`
- Create: `src/components/workspace/AudioAssetPicker.tsx`
- Modify: `src/audio/AudioEngine.ts`
- Modify: `src/hooks/useAudioEngine.ts`
- Modify: `src/components/workspace/SceneOutliner.tsx`
- Modify: `src/components/workspace/ContextInspector.tsx`
- Test: `tests/unit/local-audio-library.test.ts`
- Test: `tests/unit/workspace-listeners.test.ts`
- Test: `tests/unit/audio-engine.test.ts`
- Test: `tests/e2e/workspace-authoring.spec.ts`

**Interfaces:**
- Consumes Task 1 entity commands and Task 3 shell.
- Produces IndexedDB-backed `LocalAudioLibrary`, runtime audio-asset resolver, Add menu, and active-listener UI.

- [x] **Step 1: Write failing listener and local-asset tests**

Require add-listener auto-activation, click-to-activate, fallback after delete, last-listener protection, source count limits, MIME/size/budget validation, decode rejection preservation, and object-URL cleanup.

- [x] **Step 2: Run tests red**

Run: `pnpm test -- workspace-listeners local-audio-library audio-engine`

- [x] **Step 3: Implement IndexedDB local audio**

Store `{ id, name, mimeType, size, blob, createdAt }`. Accept WAV/MP3/Ogg only, reject files above 25 MB or a library total above 100 MB, and never call a server endpoint. Expose list/add/remove/resolve/relink and an in-memory fallback with a warning.

- [x] **Step 4: Add runtime asset resolution to `AudioEngine`**

Inject `resolveAudioAsset(clipId): Promise<ArrayBuffer>` before registry lookup. Keep the existing `/audio/` allowlist for built-ins. Cache decoded buffers by stable asset ID and dispose graphs/object URLs when a source disappears.

- [x] **Step 5: Implement Add and active-listener flows**

Add Listener, Source, Wall, and Portal actions to one menu. Source creation waits for a built-in/local asset selection. Clicking a Listener sets selection and `activeListenerId`; the active badge appears in Outliner and the projected engine scene changes smoothly.

- [x] **Step 6: Verify and commit**

Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`.

```bash
git add src/domain/audio-assets src/hooks src/audio src/components/workspace tests
git commit -m "feat(workspace): add listeners and local sources"
```

---

### Task 5: Editable 3D room, finite Walls/Portals, and reversible disable

**Files:**
- Create: `src/domain/workspace/geometry-constraints.ts`
- Modify: `src/acoustics/hybrid3d/compile.ts`
- Modify: `src/components/workspace/HybridViewportAdapter.tsx`
- Modify: `src/components/workspace/ContextInspector.tsx`
- Modify: `src/components/workspace/SceneOutliner.tsx`
- Modify: `src/components/lab/HybridSpatialViewport.tsx`
- Modify: `src/components/workbench/SceneEditor.tsx`
- Test: `tests/unit/workspace-geometry-constraints.test.ts`
- Test: `tests/unit/hybrid3d-compile.test.ts`
- Test: `tests/e2e/workspace-geometry.spec.ts`

**Interfaces:**
- Consumes authoring room/Wall/Portal types and project commands.
- Produces validated two-click Wall authoring, hosted Portal dimensions, room resize, and enabled-surface compiler filtering.

- [x] **Step 1: Write failing geometry and disable tests**

Cover rectangular room resize, entity clamps, Wall min length/thickness/bottom/top, Portal attachment/offset/width/bottom/top/thickness, floor-disable rejection, disabled exterior escape area, disabled interior omission, hosted Portal suspension, and re-enable restoration.

- [x] **Step 2: Run tests red**

Run: `pnpm test -- workspace-geometry-constraints hybrid3d-compile`

- [x] **Step 3: Implement pure constraints**

Provide `resizeRoomAndClamp`, `constrainWall3D`, `constrainPortal3D`, and `toggleEntityEnabled`. All return typed results with either a valid next project or an exact user-facing notice.

- [x] **Step 4: Compile enabled finite geometry**

Build floor, optional ceiling, enabled boundary panels, and enabled interior Wall patches with explicit thickness/bottom/top. Carve enabled/open hosted Portals; compile closed Portal slabs using Portal thickness. Represent disabled exterior surfaces as room-energy escape areas.

- [x] **Step 5: Implement viewport authoring and Inspector fields**

Add two-click Wall placement, Portal-on-selected-Wall creation, room dimension fields, Wall/Portal finite-dimension fields, Enable/Disable, Delete, and Outliner disabled styling. Disabled objects remain in Outliner but disappear from both viewports.

- [x] **Step 6: Verify and commit**

Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`.

```bash
git add src/domain/workspace src/acoustics/hybrid3d src/components tests
git commit -m "feat(workspace): author finite room geometry"
```

---

### Task 6: Matched-frame 3D path visualization

**Files:**
- Create: `src/components/workspace/HybridPathOverlay.tsx`
- Modify: `src/components/lab/HybridSpatialViewport.tsx`
- Modify: `src/components/workspace/HybridViewportAdapter.tsx`
- Modify: `src/acoustics/hybrid3d/reflection-rendering.ts`
- Modify: `src/audio/types.ts`
- Test: `tests/unit/hybrid-path-overlay.test.ts`
- Test: `tests/e2e/workspace-paths.spec.ts`

**Interfaces:**
- Consumes the accepted Hybrid Worker frame and active project selection.
- Produces direct, blocked, Portal, floor, ceiling, and Wall first-order paths with one shared revision gate.

- [x] **Step 1: Write failing overlay tests**

Require source/reflection/listener XYZ polylines for floor, ceiling, and vertical walls; reject stale revisions; default to selected-source reflections; support Paths, Show all paths, and presentation-only Ceiling visibility.

- [x] **Step 2: Run tests red**

Run: `pnpm test -- hybrid-path-overlay`

- [x] **Step 3: Expose complete path-display data**

Add surface kind/name, reflection point, path vertices, path length, relative delay, and gain to a display-only mapping derived from the accepted frame. Do not re-run reflection geometry in React.

- [x] **Step 4: Render projected 3D overlays**

Project every XYZ vertex through the same viewport camera. Use solid cyan/white direct, red blocked, cyan Portal, amber dashed first-order, and focusable amber reflection nodes. Apply faded X-ray styling when the ceiling/shell is visually present.

- [x] **Step 5: Add compact controls and hint cards**

Add `Paths`, `Show all paths`, and `Ceiling` to the viewport toolbar. Reflection-node hover/focus shows surface, length, delay, and gain. Controls affect presentation only.

- [x] **Step 6: Verify and commit**

Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`.

```bash
git add src/components/workspace src/components/lab src/acoustics/hybrid3d src/audio tests
git commit -m "feat(lab): visualize matched 3d acoustic paths"
```

---

### Task 7: Product hardening and documentation

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/workspace/*.tsx`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/ACCEPTANCE_TESTS.md`
- Modify: `docs/BUILD_CHECKLIST.md`
- Modify: `docs/DECISION_LOG.md`
- Modify: `docs/STATUS.md`
- Test: `tests/e2e/workspace.spec.ts`
- Test: `tests/e2e/workspace-authoring.spec.ts`
- Test: `tests/e2e/workspace-geometry.spec.ts`
- Test: `tests/e2e/workspace-paths.spec.ts`

**Interfaces:**
- Consumes every prior task.
- Produces the final statically verified workspace and truthful handoff documentation.

- [x] **Step 1: Add accessibility and responsive acceptance tests**

Require visible focus, keyboard-equivalent object selection/editing, active/disabled announcements,
reduced-motion safety, mobile viewport-first drawers, no page scroll during 3D wheel input, and no
uncaught page errors.

- [x] **Step 2: Add performance and persistence stress cases**

Use the 100-Wall fixture, four Sources, eight Listeners, eight Portals, mode switching, and repeated
refresh. Require no state loss, no duplicated source graphs, Worker p95 within the documented budget,
and no long task above 50 ms in the tested edit sequence.

- [x] **Step 3: Finish compact visual design**

Remove duplicated prose and obsolete Classic/Hybrid page chrome. Keep labels concise, move extended
help into cards, verify the Outliner/viewport/Inspector hierarchy at desktop and narrow widths, and
retain the established semantic colour system.

- [x] **Step 4: Update contracts and user documentation**

Document workspace authoring schema/migration, independent caches, local-audio privacy/limits,
Active Listener, Disable/Delete, 3D path-overlay truth source, Reset, supported browsers, and known
approximation boundaries.

- [x] **Step 5: Run final verification**

Run: `pnpm lint`

Run: `pnpm typecheck`

Run: `pnpm test`

Run: `pnpm build`

Run: `pnpm e2e`

Expected: all commands PASS with no skipped/flaky tests and no P0/P1 defects.

- [x] **Step 6: Commit**

```bash
git add README.md docs src tests
git commit -m "feat(workspace): complete modelling editor redesign"
```
