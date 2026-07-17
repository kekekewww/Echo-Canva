# Gate B final repair report

Date: 2026-07-17

## Scope completed

1. Multi-portal routes now use the listener-facing final portal for the virtual panner and route overlay marker. The audio test applies the computed frame and verifies the corresponding panner coordinates.
2. Portal-route frames retain direct-path occluder wall IDs. The readout and red wall overlay therefore remain truthful while a portal route is active; production E2E asserts the open-portal branch.
3. The Worker clamps calculation cadence to 10-15 Hz. The deterministic fallback uses the same interval and coalesces drag updates rather than computing once per input event.
4. Worker `computeMs` now travels through `useAcousticFrame` to Transport. Diagnostics label `Worker compute` or `Fallback compute`; they no longer present `generatedAtMs` as timing.
5. Build Checklist items 5 and 6 are checked, and STATUS records the repaired verification state.

## TDD evidence

### RED

- `pnpm test -- portal audio-engine` failed the new listener-facing multi-portal assertions: expected virtual position `{ x: 5, y: 7 }`, received source-side `{ x: 7, y: 4 }`.
- `pnpm test -- portal compute-frame audio-engine scene-editor-route` failed portal occluder preservation (`[]` instead of `["partition_center"]`) and the missing overlay selector.
- `pnpm test -- acoustic-worker use-acoustic-frame` failed the missing rate-boundary export, scheduled invalid rate at `1000 ms` rather than `100 ms`, and emitted fallback revisions `[60, 61, 62]` rather than coalescing.
- `pnpm test -- use-acoustic-frame transport` failed because Worker/fallback metrics were undefined and no timing formatter existed.

### GREEN

- `pnpm test -- portal compute-frame audio-engine scene-editor-route` - 18 files / 123 tests passed.
- `pnpm test -- acoustic-worker use-acoustic-frame` - 18 files / 125 tests passed.
- `pnpm test -- use-acoustic-frame transport` - 19 files / 127 tests passed.
- The full production portal E2E initially revealed the now-correct dual `partition_center` readout entries; the test was narrowed to the explicit occluder value and then passed.

## Fresh verification outputs

```text
$ pnpm lint
$ eslint . --max-warnings=0

$ pnpm typecheck
$ tsc --noEmit

$ pnpm test
Test Files  19 passed (19)
Tests       127 passed (127)

$ pnpm e2e
$ pnpm build && playwright test
11 passed (6.7s)

$ pnpm build
✓ Compiled successfully
✓ Generating static pages using 4 workers (3/3)
Route (app)
┌ ○ /
└ ○ /_not-found
```

No persistent local server was started manually. Playwright used its repository production wrapper and shut it down after the run.
