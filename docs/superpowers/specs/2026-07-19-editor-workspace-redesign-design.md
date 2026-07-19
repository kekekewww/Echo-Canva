# Echo Canvas Unified Workspace Redesign

Date: 2026-07-19

Status: drafted from approved design; written-spec review pending

Audience: game-audio designers, interactive-media creators, and judges

## 1. Objective

Replace the current page-oriented Classic and Hybrid interfaces with one modelling-style workspace
that uses less persistent prose and makes scene authoring, selection, exact editing, auditioning,
and acoustic inspection feel like one coherent tool.

The workspace hosts two independent project modes:

- **2.5D** keeps the validated Classic acoustic engine and its own project state.
- **3D** keeps the isolated Hybrid engine and its own project state.

Switching mode changes the active viewport and project. It does not convert, merge, or overwrite
the other mode's scene.

## 2. Product principles

1. The viewport is the primary editor; the Inspector is the precision editor.
2. Selection is shared across viewport, Outliner, and Inspector.
3. Labels stay visible; explanations move into contextual hint cards.
4. Every destructive action is explicit. Disable is reversible and Delete is permanent.
5. A scene may contain multiple listeners, but exactly one listener is acoustically active.
6. Visual overlays render deterministic engine results rather than independently approximating
   acoustic paths.
7. Existing Classic output and regression evidence remain protected behind an adapter.

## 3. Workspace layout

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Project │ 2.5D | 3D │ Add │ Play │ Raw/Sim │ Undo/Redo │ Reset    │
├──────────────┬───────────────────────────────────┬──────────────────┤
│ Scene        │                                   │ Inspector        │
│ Outliner     │          Active viewport          │                  │
│              │                                   │ Transform        │
│ Listeners    │                                   │ Object settings  │
│ Sources      │                                   │ Acoustic state   │
│ Room         │                                   │                  │
│ Walls        │                                   │                  │
│ Portals      │                                   │                  │
├──────────────┴───────────────────────────────────┴──────────────────┤
│ Active Listener │ Route │ Gain │ RT60 │ Worker │ expandable debug │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.1 Persistent regions

- The top toolbar, Outliner, Inspector, audition controls, and status bar keep stable positions.
- Mode switching replaces the active project adapter and viewport without route navigation.
- On narrow screens, the viewport remains primary and the Outliner/Inspector become drawers.

### 3.2 Visual language

- Workspace: deep blue-grey instrument surface.
- Listener: amber.
- Source and Portal: cyan.
- Wall and blocked path: coral.
- Reflection path and reflection point: warm amber.
- X/Y/Z use restrained axis colours only on axis indicators and numeric-field accents.
- UI text uses a compact interface face; numeric values and diagnostics use a utility monospace.

The signature interaction is the selection bridge: clicking an object in either the viewport or
Outliner immediately makes the Inspector describe and edit that exact object.

## 4. Mode model

The workspace owns two independent `ProjectState` values:

```ts
type WorkspaceMode = "classic-2d5d" | "hybrid-3d";

type WorkspaceState = {
  activeMode: WorkspaceMode;
  classic: ProjectState2D5D;
  hybrid: ProjectState3D;
};
```

Each project independently stores:

- scene document and revision;
- active listener ID;
- selected object ID;
- viewport camera and overlays;
- undo/redo history;
- collapsed panels and short-lived UI preferences.

The authoring-store schema is versioned independently from engine-facing `SceneSpec` and
`SceneDocumentV2`. Existing v1 Classic and v2 Hybrid documents migrate into the new authoring
store; adapters continue producing the current engine contracts until a later acoustic change
requires a separately reviewed version.

Switching mode flushes the pending save for the departing project, activates the other cached
project, and updates the existing persistent audio graph through the selected adapter. It must not
reset the AudioContext or duplicate sources.

## 5. Scene entities

### 5.1 Shared authoring concepts

Both modes expose these Outliner groups:

- Listeners;
- Sound sources;
- Room or boundary;
- Walls;
- Portals.

Hard limits remain:

- 100 walls;
- 8 portals;
- 4 sound sources;
- 8 listeners;
- 50 m maximum room dimension;
- at least one listener per project.

### 5.2 Listener collection

The authoring document contains a listener collection and `activeListenerId`. The engine adapter
projects only the active listener into the existing single-listener acoustic contract.

- Adding a listener makes it active.
- Clicking a listener in the viewport or Outliner makes it active.
- Active-listener changes use the existing smoothed Web Audio parameter path.
- Deleting the active listener selects the next enabled listener in Outliner order.
- The final listener cannot be deleted or disabled.

### 5.3 Sound sources

The Add Source flow offers:

- a registered built-in mono asset; or
- a supported local audio file.

Local files are decoded in the browser, stored only in IndexedDB, never sent to the server, and
referenced by a generated local asset ID. Cancelling or failing decode does not create an empty
source. A source stores name, transform, gain, loop, and asset reference. The first release accepts
browser-decodable WAV, MP3, and Ogg files up to 25 MB each, with a 100 MB local-library budget.

### 5.4 Hybrid room

The 3D room is an adjustable rectangular volume:

```ts
type Room3D = {
  widthM: number;
  depthM: number;
  heightM: number;
  floorMaterialId: MaterialId;
  ceilingMaterialId: MaterialId;
  ceilingEnabled: boolean;
  boundaryWalls: BoundaryWall3D[];
};
```

The default is `12 × 8 × 3 m`. Floor is always enabled. Ceiling and boundary walls can be
disabled. Reducing room dimensions clamps affected entities back into valid bounds and emits one
short, dismissible result card.

### 5.5 Hybrid walls and Portals

```ts
type Wall3D = {
  id: string;
  name: string;
  a: Vec2;
  b: Vec2;
  thicknessM: number;
  bottomM: number;
  topM: number;
  materialId: MaterialId;
  enabled: boolean;
};

type Portal3D = {
  id: string;
  name: string;
  hostWallId: string;
  offsetM: number;
  widthM: number;
  bottomM: number;
  topM: number;
  thicknessM: number;
  open: boolean;
  enabled: boolean;
};
```

Wall placement is a two-click endpoint operation followed by precise Inspector editing. A Portal
can be added only when an enabled Wall is selected. Its offset, width, bottom, and top are clamped
to the finite host wall. A host-wall edit preserves Portal attachment when possible. Portal
thickness controls its closed barrier slab and visible frame; the open passage continues through
the complete host-wall thickness.

2.5D walls retain their planar geometry and gain `enabled`. Their Portal authoring data also gains
an explicit thickness for closed-state obstruction, and attached Portals follow the same enable
dependency.

## 6. Disable and Delete semantics

`enabled = false` is a reversible scene state, not a display preference:

- the object stays in the Outliner, cache, undo history, and exported authoring document;
- the object is absent from the viewport;
- the object is excluded from geometry compilation, obstruction, reflection, Portal routing,
  surface/RT60 estimation, and other acoustic calculations;
- Portals hosted by a disabled Wall are inactive but retain all settings;
- re-enabling restores the original transform, dimensions, material, and dependent Portals.

Floor cannot be disabled. The final enabled listener cannot be disabled. Delete permanently removes
an author-created object after any required confirmation and follows existing cascade rules.
Disabling a ceiling or exterior boundary represents an open acoustic boundary: it contributes no
reflection and its opening area is treated as energy escape by the room estimate. Disabling an
interior wall removes that wall from the estimate entirely.

The 3D viewport may separately hide the ceiling for inspection. That presentation-only tool does
not change `enabled` or acoustic results.

## 7. Inspector and numeric interaction

The Inspector shows only the selected object's relevant sections. In 3D, Transform is one card
containing X, Y, and Z. In 2.5D, the same card contains X and Z only; it does not imply a simulated
vertical coordinate.

Every numeric field supports:

- click to enter an exact value with an optional unit;
- horizontal pointer drag on the value to scrub continuously;
- `Shift + drag` for fine adjustment;
- `Ctrl + drag` for grid-step adjustment;
- arrow keys for normal steps and `Shift + Arrow` for fine steps;
- Enter to commit and Escape to restore the pre-edit value.

The field displays the authoritative rounded value but commits a finite numeric value at full
internal precision. Invalid input retains the last legal value and opens a nearby hint card with
the accepted range. Sliders are removed from Transform and dimension editing.

## 8. Commands and history

The toolbar exposes Add, Play, Raw/Simulated, Undo, Redo, and Reset. Common keyboard commands are
available through tooltips and a shortcut card rather than permanent prose.

- Undo/Redo covers entity add/delete, transforms, dimensions, material, enable state, Portal state,
  room resize, and active-listener changes.
- Camera orbit and panel expansion are not scene-history actions.
- Reset opens a compact confirmation card and resets only the active mode to its default scene.
- Reset preserves the other mode and the local audio library.
- A separate settings action clears all local projects and local audio only after explicit
  confirmation.

## 9. 3D viewport path overlays

The Hybrid viewport draws paths from the same accepted Worker frame used by audio:

- cyan/white solid line: visible direct path;
- red line: blocked direct path;
- cyan polyline: Portal-aware route;
- amber dashed polyline: first-order 3D reflection;
- amber node: finite reflection point.

Reflections include finite floor, ceiling, and vertical-wall patches. Each displayed path connects
Source → reflection point → Active Listener using real XYZ coordinates. The candidate is shown only
when the reflection point lies within the finite patch and both legs pass visibility checks.

The ceiling is semi-transparent by default and can be hidden for inspection. When a visible room
surface occludes a path in the camera view, the path remains legible as a faded X-ray dash. This is
presentation only.

Path controls:

- `Paths` toggles all path overlays;
- default shows direct/Portal paths for the Active Listener;
- selecting a Source adds its first-order reflections;
- `Show all paths` displays reflection paths for every enabled Source;
- hover/focus on a reflection point opens a card with surface name, path length, relative delay,
  and gain.

No visual-only ray solver is permitted.

## 10. Local persistence

Small project data uses versioned `localStorage` records. Local audio blobs use IndexedDB.

```text
classic project key
├─ scene and revision
├─ active listener / selection
├─ camera and overlays
└─ UI state

hybrid project key
├─ scene and revision
├─ active listener / selection
├─ camera and overlays
└─ UI state

IndexedDB audio library
└─ metadata + local blobs
```

Scene updates save after a short debounce. Mode switching and page lifecycle events flush pending
saves. Cache documents have an explicit schema version and pure migrations. A migration failure
preserves the unread source record, loads a safe preset, and presents a recovery/export card.
Undo history is stored as at most 50 compact commands per mode so persistence cannot grow without
bound.

JSON export exports the active mode's authoring document. It records local-asset metadata but does
not embed audio blobs. Import on another browser retains the Source and marks the unavailable asset
as `Relink required`; selecting a replacement file repairs that reference without moving the
Source.

If IndexedDB is unavailable, built-in assets continue working and the workspace declares that
local files and this session cannot be persisted.

## 11. Adapter boundaries

The shell depends on a mode adapter rather than directly importing either engine:

```ts
interface WorkspaceModeAdapter {
  getProject(): AuthoringProject;
  dispatch(command: WorkspaceCommand): CommandResult;
  getViewportModel(): ViewportModel;
  getInspectorModel(): InspectorModel;
  getAcousticFrame(): AcousticDisplayFrame | null;
  applyToAudio(): void;
}
```

The Classic adapter projects the active authoring listener to the current `SceneSpec.listener` and
filters disabled walls/Portals before calling the existing Worker. The Hybrid adapter compiles the
active 3D document into finite patches/BVH and passes the same accepted frame to audio and overlays.

This boundary avoids rewriting validated acoustic formulas as part of the UI redesign.

## 12. Error handling

- Invalid numeric edit: keep the last valid value and show the exact accepted range.
- Portal without a selected host Wall: reject creation and direct the user to select a Wall.
- Unsupported or undecodable audio: retain the scene and do not create a Source.
- Missing imported local audio: retain the Source as silent and offer `Relink audio`.
- Source/listener/Wall/Portal limit reached: disable the Add item and explain the limit in a card.
- Storage unavailable: continue in memory with a persistent warning badge.
- Cache migration failure: preserve the original record and load a safe preset.
- Worker failure: stop simulation for the active mode, preserve its project, and keep the other
  mode available.
- Audio failure: preserve authoring and show a retry action without recreating scene state.

## 13. Accessibility and responsive behaviour

- Every viewport object has a keyboard-equivalent Outliner item and Inspector field.
- Selection, active listener, disabled state, and route changes have accessible names/status.
- Numeric scrubbing never replaces text input or arrow-key editing.
- Focus is visible and logical across toolbar → Outliner → viewport → Inspector → status.
- Reduced-motion preferences suppress non-essential transitions.
- Narrow screens use modal drawers without changing project semantics.

## 14. Verification

### Unit and integration coverage

- independent mode caches and schema migrations;
- mode switch preserves both projects and AudioContext identity;
- numeric parse, units, scrubbing modifiers, clamping, cancel, and commit;
- undo/redo and current-mode-only Reset;
- active-listener add/select/delete/disable invariants;
- local asset metadata, decode failure, and object-URL cleanup;
- 3D room resize and entity clamping;
- wall thickness/bottom/top constraints;
- Portal host, offset, width, bottom, top, and thickness constraints;
- disabled-object exclusion from render and every acoustic compiler input;
- floor/ceiling/wall reflection overlay coordinates match the accepted Hybrid frame.

### Browser coverage

1. Edit 2.5D, switch to 3D, edit it, switch back, and observe exact restoration.
2. Refresh and restore both modes without duplicated audio sources.
3. Add listeners and confirm click-to-activate audio/diagnostic switching.
4. Add built-in and local sources and recover them after refresh.
5. Edit values through typing, scrubbing, and keyboard input.
6. Resize the 3D room and edit Wall/Portal dimensions without invalid geometry.
7. Disable/re-enable 2.5D and 3D walls and confirm visual and acoustic exclusion/restoration.
8. Display floor, ceiling, and wall reflection paths from the matching Worker revision.
9. Undo/redo edits and reset only the active mode.
10. Run the existing Classic and Hybrid regression suites unchanged.

## 15. Implementation slices

1. **Workspace foundation:** shared shell, mode adapters, independent caches, mode switch, Reset.
2. **Precision editing:** reusable numeric scrub field, command history, contextual Inspector.
3. **Entity authoring:** listener collection, active-listener projection, dynamic sources, local
   audio library.
4. **Hybrid geometry authoring:** rectangular room, arbitrary interior Walls, finite dimensions,
   hosted Portals, and enable semantics across both modes.
5. **Path visualization:** matched-frame direct, Portal, floor, ceiling, and wall reflection overlays.
6. **Product hardening:** responsive drawers, accessibility, performance, migration recovery,
   clean-session validation, and documentation.

Each slice ends with full lint, typecheck, unit, production build, and browser regression checks,
plus a focused human acceptance gate. No slice may silently change Classic acoustic formulas or
enable unvalidated second-order/directional-late research branches.

## 16. Explicit non-goals for this redesign

- converting 2.5D scenes into 3D scenes or synchronizing their content;
- simultaneous audio output from multiple listeners;
- arbitrary non-rectangular 3D room shells in the first release;
- remote audio upload or server storage;
- true wave diffraction, FDTD, or architectural-acoustics accuracy claims;
- enabling second-order reflection or directional late-field research by default;
- replacing the existing deterministic solvers during the UI migration.
