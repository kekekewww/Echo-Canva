# Unified Workspace Requirement Evidence

This file is the release evidence matrix for
`docs/superpowers/specs/2026-07-19-editor-workspace-redesign-design.md`.
A row may be marked complete only when both implementation and automated evidence exist.

| Requirement | Implementation evidence | Automated evidence | Status |
| --- | --- | --- | --- |
| Independent 2.5D and 3D authoring projects | `src/hooks/useWorkspaceProjects.ts` | `workspace-persistence.test.ts`, `workspace.spec.ts` | Partial: scene state exists; view/UI/history persistence pending |
| Persistent AudioContext across mode switches | Shared workspace audio engine | Browser regression asserting one context/graph | Missing |
| Versioned authoring migration and recovery | `src/domain/workspace/persistence.ts` | v1 SceneSpec, v2 Hybrid and corrupt-cache cases | Partial |
| Camera, overlays and UI state stored per mode | Authoring view state | persistence and mode-switch tests | Missing |
| Bounded, persisted undo/redo including active listener | `src/domain/workspace/history.ts` | history reload and listener activation tests | Partial |
| Toolbar Add, Play, Raw/Simulated, Undo/Redo, Reset | `WorkspaceToolbar.tsx` | keyboard and browser flows | Partial |
| Active Listener / Route / Gain / RT60 / Worker status | `WorkspaceStatusBar.tsx` | accessible status assertions | Missing |
| Local mono audio, memory fallback, missing/relink/remove | local audio library and picker | library and browser recovery tests | Partial |
| Authoring JSON export/import including local metadata | authoring transfer module | round-trip and missing-asset tests | Missing |
| Source name, transform, gain, loop and asset editing | contextual inspector | source authoring browser flow | Partial |
| Limits disable Add items with an explanation | `AddObjectMenu.tsx` | limit browser tests | Missing |
| Two-click Wall placement in both modes | viewport adapters | geometry browser tests | Missing |
| Portal requires an enabled selected Wall | Add command validation | reducer and browser tests | Missing |
| Finite Wall/Portal constraints and attachment preservation | geometry constraints | pure geometry tests | Partial |
| Wall extrusion, full-depth opening and closed Portal slab | Hybrid compiler | ray/compile tests | Partial |
| Disable removes visual/acoustic object; exterior openings leak energy | projections/compiler/room estimate | disable and RT60 tests | Partial |
| Compact in-app confirmation for Reset/Delete/Clear all | workspace cards | browser tests | Missing |
| Numeric input/scrub/keyboard semantics | `NumericScrubField.tsx` | component and browser tests | Partial |
| Matched-frame 3D paths, X-ray style and reflection detail card | Hybrid path overlay | unit and browser tests | Partial |
| Responsive modal Outliner/Inspector drawers | workspace shell/CSS | narrow viewport tests | Missing |
| Accessible focus, status announcements and reduced motion | workspace primitives | accessibility browser checks | Partial |
| Storage/worker/audio failures preserve authoring and expose recovery | hooks and error cards | failure injection tests | Partial |
| 100 Wall / 8 Portal / 4 Source / 8 Listener stress | fixture and instrumentation | performance browser test | Missing |
| Classic and Hybrid regression behavior remains covered | compatibility browser suites | legacy-equivalent flows | Partial |
| Truthful README, contracts, status and acceptance docs | project documentation | final audit | Missing |

## Release rule

The redesign is complete only when every row above is `Complete`, all references are current,
and the following fresh commands pass without skipped tests:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```
