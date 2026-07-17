# Status

Current phase: Gate C Task 1 implemented; remaining Gate C audio integration is pending.

Current checklist state: Build Checklist items 5 (direct occlusion) and 6 (explicit portal routing) are implemented and verified. Gate B passed human acceptance on 2026-07-17. Gate C Task 1 now supplies deterministic first-order reflection taps and three-band Eyring room estimates to `computeAcousticFrame`; persistent reflection-tap audio rendering and late reverberation remain pending.

## Gate C Task 1 verification - 2026-07-17

- `pnpm test -- image-source room-acoustics compute-frame` - PASS, 21 files / 138 tests
- `pnpm lint` - PASS
- `pnpm typecheck` - PASS
- `pnpm test` - PASS, 21 files / 138 tests
- `git diff --check` - PASS

Known defects: no known deterministic-calculation defects in Gate C Task 1. Its browser-audio consumers are intentionally not implemented in this slice.

Next action: implement and test the fixed early-reflection tap bank and stable late-reverb network, then prepare the Gate C human acceptance candidate.

## Verification evidence - 2026-07-17

- `pnpm lint` - PASS
- `pnpm typecheck` - PASS
- `pnpm test` - PASS, 19 files / 127 tests
- `pnpm e2e --grep "occluded portal route"` - PASS, 1 Chromium test through the repository production wrapper on port 3000
- `pnpm e2e` - PASS, 11 Chromium tests through the repository production wrapper on port 3000
- `pnpm build` - PASS

The 2026-07-17 final repair also verified listener-facing multi-portal panning, portal-route direct-wall occluder overlays, 10-15 Hz Worker/fallback coalescing, and measured Worker/fallback compute-duration labels.

Earlier isolated-port evidence: before port 3000 was available, a fresh production build was served on port 3001 and passed the focused portal test and all 11 browser tests. That evidence remains historical only; the exact wrapper verification above is the current Gate B evidence.

## Human gate status

- Gate A: PASS (2026-07-17)
- Gate B: PASS (2026-07-17)
- Gate C: pending
- Gate D: pending
- Gate E: pending

## Human Gate B candidate

Build with `pnpm build`, then start with `pnpm start --hostname 127.0.0.1 --port 3000` and open `http://127.0.0.1:3000` in current desktop Chrome or Edge. Use headphones.

1. Open the canonical **Concrete Partition** preset, press **Start Audio**, and select **Simulated**.
2. Select the listener and move it down to approximately `(3, 2)` with the arrow keys, keeping it on the opposite side of the center partition and below the doorway.
3. With the designated portal open, confirm **Portal route**, `partition_center`, Effective distance, Direct gain, Low-pass, and the cyan route/listener-facing portal marker are visible; listen for direction toward the doorway.
4. Select the designated portal and close it. Confirm **Blocked fallback**, `partition_center` as an occluder, the red wall highlight, and lower direct gain/low-pass values.
5. Reopen and close the portal once more while listening. Confirm the route and direction change smoothly, no click or burst occurs, and the inspector states: `Portal-aware sound propagation is an interactive acoustic approximation; it is not diffraction.`

Expected result: the open portal provides a portal-aware route and the closed portal produces an occluded fallback. This is an interactive acoustic approximation for spatial-audio prototyping and previsualization, not architectural acoustics or diffraction.

Known deviations: browser automation verifies deterministic route selection, displayed frame values, overlays, control changes, and absence of page errors; it cannot verify individual headphone perception or hardware-specific clicks. The original test path was corrected under D-012 because it crossed the open doorway directly. No architectural-acoustics accuracy claim is made.

Human result: `PASS` (2026-07-17). Gate C deterministic calculations are now implemented; browser-audio integration remains pending.
