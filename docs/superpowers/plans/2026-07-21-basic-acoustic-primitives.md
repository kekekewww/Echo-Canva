# Basic Acoustic Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable Box, Cylinder, and Sphere acoustic obstacles to the shared 2.5D/3D authoring workspace.

**Architecture:** Keep API-facing `SceneSpec` 1.0 stable. Store authored primitives in `WorkspaceProject`, project their footprints into synthetic Classic wall segments, and serialize complete 3D primitive records through the existing `SceneDocumentV2.spatial3d` extension. Compile finite planar facets into the Hybrid BVH so direct occlusion and first-order reflection remain deterministic; cylinders and spheres are explicitly faceted approximations.

**Tech Stack:** TypeScript strict, React, SVG, Zod, Vitest, Playwright, existing deterministic Hybrid BVH.

## Global Constraints

- Primitive kinds are exactly `box`, `cylinder`, and `sphere`.
- Maximum eight primitives per mode.
- Positions and extents remain inside the authored room; minimum dimension is 0.1 m.
- Box uses exact planar faces; Cylinder uses 12 radial facets; Sphere uses 8 longitude by 4 latitude facets.
- Every primitive supports selection, X/Y/Z position, dimensions, Y rotation, material, Disable, Delete, Undo/Redo, cache, and authoring JSON.
- Classic uses the horizontal footprint as a full-height 2.5D obstacle; Hybrid uses authored vertical geometry.
- UI copy says `Faceted acoustic approximation` for Cylinder and Sphere.
- Existing wall/source/listener/Portal limits and behavior remain unchanged.

---

### Task 1: Primitive contract, validation, and footprint projection

**Files:**
- Create: `src/domain/workspace/primitives.ts`
- Modify: `src/domain/workspace/types.ts`
- Test: `tests/unit/workspace-primitives.test.ts`

**Interfaces:**
- Produces `AcousticPrimitive`, `PrimitiveKind`, `MAX_PRIMITIVES`, `primitiveFootprint()`, `primitiveFootprintWalls()`, and `constrainPrimitive()`.
- `AcousticPrimitive` contains `id`, `name`, `kind`, `position`, `dimensions`, `rotationYDeg`, and registered `materialId`.

- [ ] **Step 1: Write the failing domain tests**

```ts
expect(primitiveFootprint(box)).toHaveLength(4);
expect(primitiveFootprint(cylinder)).toHaveLength(12);
expect(primitiveFootprint(sphere)).toHaveLength(12);
expect(constrainPrimitive(project, outside).position.x).toBeLessThanOrEqual(project.room3d.widthM);
```

- [ ] **Step 2: Run the focused test and verify missing APIs fail**

Run: `pnpm test -- workspace-primitives`

- [ ] **Step 3: Implement deterministic rotated footprints and room constraints**

```ts
export type AcousticPrimitive = Readonly<{
  id: string;
  name: string;
  kind: "box" | "cylinder" | "sphere";
  position: Vec3;
  dimensions: Vec3;
  rotationYDeg: number;
  materialId: string;
}>;
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm test -- workspace-primitives`

### Task 2: Reducer, persistence, projection, and migration

**Files:**
- Modify: `src/domain/workspace/defaults.ts`
- Modify: `src/domain/workspace/project-reducer.ts`
- Modify: `src/domain/workspace/persistence.ts`
- Modify: `src/domain/workspace/projections.ts`
- Modify: `src/domain/scene-document/types.ts`
- Modify: `src/domain/scene-document/schema.ts`
- Test: `tests/unit/workspace-project-reducer.test.ts`
- Test: `tests/unit/workspace-persistence.test.ts`
- Test: `tests/unit/workspace-projections.test.ts`

**Interfaces:**
- Adds reducer actions `ADD_PRIMITIVE`, `UPDATE_PRIMITIVE`, and `DELETE_PRIMITIVE`.
- Adds optional `spatial3d.primitives` to the v2 document while migrating old projects to `primitives: []`.

- [ ] **Step 1: Write failing reducer, migration, and projection tests**

```ts
const added = projectReducer(project, { type: "ADD_PRIMITIVE", primitive });
expect(added.primitives).toContainEqual(primitive);
expect(projectHybridDocument(added).extensions.spatial3d?.primitives).toEqual([primitive]);
expect(projectClassicScene(added).walls.some(({ id }) => id.startsWith("primitive:"))).toBe(true);
```

- [ ] **Step 2: Run focused tests and verify contract failures**

Run: `pnpm test -- workspace-project-reducer workspace-persistence workspace-projections`

- [ ] **Step 3: Implement immutable actions, old-cache defaults, disabled filtering, and projection**

Primitive footprint walls use stable IDs `primitive:<primitiveId>:<edgeIndex>` and the primitive material. Hybrid documents carry enabled primitives directly instead of compiling those synthetic walls.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `pnpm test -- workspace-project-reducer workspace-persistence workspace-projections`

### Task 3: Hybrid faceted geometry and audible occlusion

**Files:**
- Create: `src/acoustics/hybrid3d/primitives.ts`
- Modify: `src/acoustics/hybrid3d/geometry.ts`
- Modify: `src/acoustics/hybrid3d/compile.ts`
- Modify: `src/acoustics/hybrid3d/audible-direct.ts`
- Test: `tests/unit/hybrid3d-primitives.test.ts`

**Interfaces:**
- Produces `primitivePatches(primitive)` with stable face IDs.
- Patch hits carry `surfaceId`, `materialId`, and effective thickness so primitive obstruction can drive gain and low-pass without pretending to be a Wall.

- [ ] **Step 1: Write failing patch, ray, reflection, and material tests**

```ts
expect(primitivePatches(box)).toHaveLength(6);
expect(primitivePatches(cylinder)).toHaveLength(14);
expect(primitivePatches(sphere)).toHaveLength(32);
expect(solveDirectPath3D(source, listener, geometry.bvh).hits[0]?.surfaceId).toBe(box.id);
```

- [ ] **Step 2: Run focused tests and verify missing compiler support fails**

Run: `pnpm test -- hybrid3d-primitives`

- [ ] **Step 3: Implement facet generation, BVH fingerprinting, and material-aware hit loss**

```ts
makePatch3(`${primitive.id}:face:${index}`, "primitive", primitive.materialId, vertices, {
  surfaceId: primitive.id,
  thicknessM: Math.min(primitive.dimensions.x, primitive.dimensions.z),
});
```

- [ ] **Step 4: Run focused Hybrid tests and verify they pass**

Run: `pnpm test -- hybrid3d-primitives hybrid3d-direct hybrid3d-reflections`

### Task 4: Modelling UI and both viewports

**Files:**
- Modify: `src/components/workspace/AddObjectMenu.tsx`
- Modify: `src/components/workspace/UnifiedWorkspace.tsx`
- Modify: `src/components/workspace/SceneOutliner.tsx`
- Modify: `src/components/workspace/ContextInspector.tsx`
- Modify: `src/components/workspace/ClassicViewportAdapter.tsx`
- Modify: `src/components/workspace/HybridViewportAdapter.tsx`
- Modify: `src/components/workbench/SceneEditor.tsx`
- Modify: `src/components/lab/HybridSpatialViewport.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/e2e/workspace-primitives.spec.ts`

**Interfaces:**
- Add menu exposes a compact `Shapes` group with Box, Cylinder, Sphere.
- Outliner rows use `primitive` entity refs.
- Inspector exposes one Transform section plus contextual dimensions, rotation, material, Disable, and Delete.
- Both viewports select and drag primitives in X/Z; Hybrid Shift-drag edits Y.

- [ ] **Step 1: Write a failing production-browser authoring flow**

```ts
await page.getByTestId("add-box").click();
await expect(page.getByRole("heading", { name: "Box" })).toBeVisible();
await page.getByRole("textbox", { name: "Width" }).fill("2.5");
await page.getByRole("combobox", { name: "Primitive material" }).selectOption("acoustic_treatment");
await expect(page.getByTestId(/hybrid-primitive-/)).toBeVisible();
```

- [ ] **Step 2: Run the focused E2E and verify it fails at the absent shape controls**

Run: `pnpm e2e --grep "authors basic acoustic shapes"`

- [ ] **Step 3: Implement the compact modelling controls and SVG silhouettes**

Use the current cyan/coral/amber workspace palette. Primitives use muted lavender surfaces so they read as geometry but do not compete with acoustic path colors. No new explanatory paragraphs are added; Cylinder/Sphere approximation appears as a tooltip/hint card.

- [ ] **Step 4: Run the focused E2E and verify it passes in both modes**

Run: `pnpm e2e --grep "authors basic acoustic shapes"`

### Task 5: Hybrid GPT candidate support and documentation

**Files:**
- Modify: `src/ai/hybrid-scene.ts`
- Modify: `src/ai/scene-compiler.ts`
- Modify: `src/ai/contracts.ts`
- Modify: `src/components/workspace/WorkspaceProjectTools.tsx`
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ACOUSTICS.md`
- Modify: `docs/DECISION_LOG.md`
- Modify: `docs/STATUS.md`
- Test: `tests/unit/hybrid-scene-generation.test.ts`

**Interfaces:**
- Hybrid structured output may include zero to eight primitives in `spatial3d.primitives`.
- Applying a Hybrid candidate atomically replaces the primitive collection; Classic GPT remains SceneSpec-compatible and applies an empty primitive collection.

- [ ] **Step 1: Write failing strict-schema and candidate-application tests**

```ts
expect(validateGeneratedHybridScene({ scene, spatial3d: { ...spatial3d, primitives: [box] } }).ok).toBe(true);
expect(next.primitives).toEqual([box]);
```

- [ ] **Step 2: Run focused AI tests and verify schema rejection**

Run: `pnpm test -- hybrid-scene-generation scene-compiler ai-client`

- [ ] **Step 3: Implement bounded schema, prompt instructions, atomic application, and truthful docs**

The model may choose only registered material IDs and bounded primitive kinds/dimensions. It never emits meshes, URLs, or executable geometry.

- [ ] **Step 4: Run focused AI tests and verify they pass**

Run: `pnpm test -- hybrid-scene-generation scene-compiler ai-client`

### Task 6: Complete verification and focused commit

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Run formatting/static checks**

Run: `pnpm lint && pnpm typecheck && pnpm test`

- [ ] **Step 2: Run production browser/build verification**

Run: `pnpm e2e && pnpm build`

- [ ] **Step 3: Check the diff and preserve unrelated files**

Run: `git diff --check && git status --short`

- [ ] **Step 4: Commit the vertical slice**

```bash
git add <primitive feature files only>
git commit -m "feat(workspace): add basic acoustic primitives"
```
