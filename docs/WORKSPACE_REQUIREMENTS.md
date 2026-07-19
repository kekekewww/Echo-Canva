# Unified workspace requirement evidence

Date: 2026-07-19

Every row below is backed by committed source plus an automated unit/integration or production-Chromium case. Human headphone perception and public deployment remain separate external gates.

| Requirement | Implementation evidence | Automated evidence | Status |
|---|---|---|---|
| Independent 2.5D and 3D projects | `useWorkspaceProjects`, per-mode reducers/adapters | `workspace-persistence.test.ts`, `workspace.spec.ts` | Complete |
| One AudioContext/graph across mode switches | root-owned `AudioEngine` | `workspace.spec.ts` graph/context assertions | Complete |
| Versioned migration and unread-cache recovery | cache v3 migrations and recovery download | `workspace-persistence.test.ts`, `workspace-failures.spec.ts` | Complete |
| Per-mode camera, overlays and panels | `WorkspaceProject.view` | persistence unit and switch/refresh browser cases | Complete |
| Bounded persisted Undo/Redo | 50 reversible patches; scrub transaction coalescing | history/persistence units; refresh/scrub browser cases | Complete |
| Toolbar Add/Play/A-B/Undo/Redo/Reset/Settings | shared workspace toolbar/cards | `workspace.spec.ts`, `workspace-authoring.spec.ts` | Complete |
| Listener/route/gain/RT60/Worker status | accessible `WorkspaceStatusBar` | workspace, legacy and failure browser cases | Complete |
| Local mono audio, fallback, missing/relink/remove | IndexedDB + memory store + stable ID | local-audio units and authoring browser case | Complete |
| Authoring transfer including local metadata | `transfer.ts` | transfer units and authoring download/import case | Complete |
| Source name/transform/gain/loop/asset editing | contextual Inspector | local-source browser case | Complete |
| Add limits and explanations | disabled popover items with reasons | maximum-entity browser case | Complete |
| Two-click Wall placement in both modes | viewport placement adapters | geometry browser case | Complete |
| Portal requires enabled selected Wall | Add availability + reducer invariant | project units and geometry browser case | Complete |
| Finite Wall/Portal constraints and attachment | pure constraints and offset editor | constraint units and precision geometry browser case | Complete |
| Full Wall extrusion/opening/closed slab | Hybrid compiler caps/jambs/slab | `hybrid3d-compile.test.ts` | Complete |
| Disable removes visual/acoustic entity; openings leak | projectors/compiler/room estimate | projection/room units and wall/ceiling browser cases | Complete |
| Reset/Delete/Clear-all confirmations | in-app modal cards | workspace and authoring browser cases | Complete |
| Typed/scrubbed/keyboard numeric semantics | `NumericScrubField` | numeric units; geometry/workspace browser cases | Complete |
| Matched-frame 3D paths and detail cards | accepted-frame overlay with X-ray presentation | path unit and browser cases | Complete |
| Responsive modal drawers | viewport-first CSS/drawers | narrow-screen browser case | Complete |
| Focus/status/reduced motion | focus-visible CSS, aria-live, modal focus | workspace/path/legacy browser cases | Complete |
| Storage/Worker/audio failure containment | memory/recovery/stopped/Retry paths | `workspace-failures.spec.ts` | Complete |
| 100 Wall / 8 Portal / 4 Source / 8 Listener stress | limit fixture and timing attributes | maximum-entity production browser case | Complete |
| Classic and Hybrid regression behaviour | mode adapters plus compatibility suite | baseline unit suite and `legacy-regressions.spec.ts` | Complete |
| Truthful contracts/status/acceptance docs | README and `docs/` audit | final verification record in `STATUS.md` | Complete after final command record |
