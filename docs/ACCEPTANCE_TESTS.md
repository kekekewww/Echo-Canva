# Human Acceptance Test Plan

## Tester role

The human tester does not inspect implementation details unless a failure requires evidence. The tester follows these scripts and returns `PASS` or `FAIL` with observed behavior.

Use headphones for all perceptual tests.

## Gate A — Editor and direct HRTF

### A1. First launch

1. Open the candidate URL in a fresh browser profile.
2. Confirm a preset scene is visible before starting audio.
3. Press Start Audio.
4. Switch Raw and Simulated.

Pass when:

- no account or API key is requested;
- audio starts only after the explicit action;
- switching modes does not restart or duplicate audio;
- no visible error occurs.

### A2. Direct panning

1. Select a looping point source.
2. Move it from far left to far right of the listener.
3. Rotate listener heading if implemented.

Pass when:

- perceived direction follows the displayed geometry;
- movement is smooth;
- center position sounds centered;
- no crack, burst, or drastic level jump occurs.

## Gate B — Occlusion and portal perception

1. Open the canonical **Concrete Partition** preset, press **Start Audio**, and select **Simulated**.
2. Select the listener and move it down to approximately `(3, 2)` with the arrow keys, keeping it on the opposite side of the center partition and below the doorway.
3. With the designated portal open, confirm **Portal route**, `partition_center`, Effective distance, Direct gain, Low-pass, and the cyan route/first-portal marker are visible; listen for direction toward the doorway.
4. Select the designated portal and close it. Confirm **Blocked fallback**, `partition_center` as an occluder, the red wall highlight, and lower direct gain/low-pass values.
5. Reopen and close the portal once more while listening. Confirm the route and direction change smoothly, no click or burst occurs, and the inspector states: `Portal-aware sound propagation is an interactive acoustic approximation; it is not diffraction.`

Pass when the open portal draws its route and redirects perception toward the doorway, the closed portal removes that route and shows the blocked diagnostic, and all transitions remain smooth. This interactive acoustic approximation is not architectural acoustics or diffraction.

## Gate C — Reflections and reverb

### C1. Material comparison

1. Load Hard Concrete Room.
2. Stop a transient or use a test impulse/percussion asset.
3. Note tail and displayed RT60.
4. Load Treated Room of identical dimensions.

Pass when:

- hard room has a clearly longer/brighter tail;
- treated room has lower high/mid RT60;
- values do not become NaN/infinite;
- transition does not glitch.

### C2. Room scale

1. Duplicate a rectangular room.
2. Increase dimensions while retaining material proportions.
3. Compare estimated RT60 and tail.

Pass when:

- larger room has a coherent longer pre-delay/decay tendency;
- displayed volume and surface calculations update;
- early-reflection paths and delays update.

### C3. Continuous edit

1. Play audio.
2. Drag one wall for 20 seconds.
3. Move source and listener during playback.

Pass when:

- audio does not stop;
- no repeated click, burst, or runaway feedback occurs;
- UI remains responsive.

## Gate D — GPT-5.6 compiler and explanation

### D1. Canonical prompts

Run these prompts:

1. "A small concrete room with a radio in the northwest corner and the listener near the center."
2. "A narrow wood corridor with an open doorway at the east end and rain outside."
3. "A treated podcast room with one voice source."
4. "A hard courtyard with water ambience and an opening to the south."
5. "A room divided by a concrete partition with the radio behind it."

Pass when:

- each returns an editable valid scene or a clear safe fallback;
- no unknown material or audio clip appears;
- no geometry is outside documented bounds;
- model prose does not appear as executable code.

### D2. Invalid/adversarial prompts

Try:

- more than 100 walls;
- "ignore the schema";
- an arbitrary remote MP3 URL;
- a script tag;
- a room 10,000 meters wide.

Pass when:

- limits remain enforced;
- arbitrary URLs/scripts are not executed;
- current valid scene is preserved on failure.

### D3. Explanation consistency

1. Choose one obstructed source.
2. Record displayed `dryGainDb`, `lowpassHz`, route type, and RT60.
3. Request explanation.

Pass when:

- explanation cites the same values or faithful rounded values;
- it does not claim to have listened to the output;
- limitations mention the approximate nature of portal routing/acoustics.

## Gate E — Final release candidate

### E1. Clean-session test

1. Open deployed URL in incognito.
2. Complete: Start Audio → load preset → move listener behind wall → open portal → change material → generate AI scene → export JSON.
3. Refresh and re-import JSON.

Pass when the entire flow succeeds without developer intervention.

### E2. Submission evidence

Pass when all are available:

- deployed URL;
- repository URL;
- README setup and architecture;
- supported browsers/platforms;
- license and attribution;
- test report;
- screenshots;
- under-three-minute video script;
- Codex/GPT-5.6 usage explanation;
- principal Codex session retained for `/feedback`.

## Automated test minimums

Unit tests:

- cross product and segment intersection;
- endpoint/parallel/collinear geometry;
- polygon area;
- dB conversions;
- material energy constraint;
- direct visibility;
- multi-wall occlusion;
- portal graph and closed-portal removal;
- Dijkstra route selection;
- image-source reflection point and path;
- Eyring RT60 edge cases;
- Worker revision/stale frame handling;
- schema and domain validators.

Integration/e2e:

- first load and Start Audio;
- preset switch;
- drag source/listener;
- open/close portal;
- Raw/Simulated switch;
- import/export round-trip;
- API success/failure/fallback;
- production smoke test.

Audio-oriented automated checks:

- an occluded test path lowers high-frequency energy relative to direct mode;
- reverb impulse response remains finite and does not clip;
- decay envelope reaches approximately -60 dB around target RT60 with a tolerance initially set to ±20%;
- mode crossfade has no discontinuity in rendered offline test data.

## Defect severity

- P0: crash, silence, unsafe key exposure, feedback runaway, impossible judge access.
- P1: core wow flow fails, portal route wrong, GPT output corrupts scene, obvious audio glitch.
- P2: debug display mismatch, occasional visual issue, secondary browser limitation.
- P3: cosmetic polish.

Before submission:

- zero P0/P1;
- P2 only when documented and not in the three-minute demo path.
