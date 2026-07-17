# Gate C Reflections and Reverb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add first-order early reflections and a stable, perceptually tuned late-reverb preview whose room metrics respond deterministically to geometry and materials.

**Architecture:** Pure image-source and room-estimation code extends the existing `AcousticFrame` in the Worker. Persistent per-source reflection taps and one persistent stereo Schroeder network receive only smoothed parameters; no audio nodes are created per frame. UI displays the exact frame paths/RT60 values, never claiming measurement accuracy.

**Tech Stack:** TypeScript strict, Web Worker, Web Audio API, Vitest, Playwright, pnpm.

## Global Constraints

- Product wording remains "interactive acoustic approximation", "first-order early reflections", and "perceptually tuned material presets"; no architectural-acoustics accuracy claim.
- Compute only first-order image-source paths and retain at most six taps per source.
- Worker/fallback cadence remains clamped to 10–15 Hz and frames remain revision-safe.
- Audio graphs are persistent; inactive reflection taps ramp gain to zero and reverb parameters use 60–150 ms smoothing.
- Use three-band Eyring RT60, clamp displayed RT60 to 0.12–4.0 s, use `c = 343 m/s`, and treat open portals as an energy-escape approximation.
- Implement a native-node Schroeder network (four combs, two all-pass stages); do not implement FDN or dynamic `ConvolverNode` buffers.
- Follow TDD; after each task run lint, typecheck and unit tests; before Gate C run full E2E and production build.

---

### Task 1: Pure first-order reflection and room-acoustics model

**Files:**
- Create: `src/acoustics/image-source.ts`, `src/acoustics/room-acoustics.ts`
- Modify: `src/acoustics/types.ts`, `src/acoustics/compute-frame.ts`
- Create: `tests/unit/image-source.test.ts`, `tests/unit/room-acoustics.test.ts`

**Interfaces:**
- `findFirstOrderReflections(source, listener, scene, maxTaps): readonly ReflectionTap[]`
- `estimateRoomAcoustics(scene): RoomAcousticFrame`
- `AcousticFrameSource.earlyReflections` contains wall ID, reflection point, path length, delay, gain, low-pass; `AcousticFrame.room` contains volume, surface, three-band RT60 and pre-delay.

- [ ] Write failing rectangle reflection tests for image point, finite reflection point, occluded candidate rejection, ranking and six-tap cap; run `pnpm test -- image-source` and observe missing-module RED.
- [ ] Implement reflection across an infinite wall line, finite segment validation, two-leg visibility excluding the reflecting wall at its endpoint, `delayMs = (pathLengthM - referenceLengthM) / 343 * 1000`, mid-band reflection amplitude, and deterministic gain/wall-ID ordering.
- [ ] Write failing room tests for shoelace area/perimeter, volume, Eyring three-band values, open-portal escape effect, numerical clamps; run `pnpm test -- room-acoustics` RED.
- [ ] Implement pure surface/absorption sums and `0.161 * volume / (-surface * ln(1 - meanAbsorption))`, clamped 0.12–4.0 s, with pre-delay clamped 5–80 ms.
- [ ] Integrate both into `computeAcousticFrame`; run `pnpm test -- image-source room-acoustics compute-frame && pnpm lint && pnpm typecheck && pnpm test`; commit `feat(acoustics): add reflections and room estimates`.

### Task 2: Persistent reflection taps and Schroeder reverb

**Files:**
- Create: `src/audio/EarlyReflectionBank.ts`, `src/audio/SchroederReverb.ts`
- Modify: `src/audio/types.ts`, `src/audio/SourceGraph.ts`, `src/audio/AudioEngine.ts`
- Modify: `tests/unit/audio-engine.test.ts`
- Create: `tests/unit/early-reflection-bank.test.ts`, `tests/unit/schroeder-reverb.test.ts`

**Interfaces:**
- `EarlyReflectionBank.apply(taps, now)` owns a fixed six-tap `Delay → Gain → Filter → Panner` pool.
- `SchroederReverb.apply(roomFrame, now)` adjusts persistent four-comb/two-all-pass stereo network from RT60/pre-delay/damping; `dispose()` disconnects every node.

- [ ] Write failing tests proving six taps are created once, extra taps are ignored, inactive taps ramp to zero, and frame updates allocate no nodes; run `pnpm test -- early-reflection-bank` RED.
- [ ] Add minimal Web Audio delay/filter interfaces and implement fixed tap construction/ramping using existing smoothing helpers; wire source reflection send without touching Raw branch.
- [ ] Write failing reverb tests for finite comb feedback derived from `10 ** (-3 * delaySeconds / rt60Mid)`, high-band damping response, clamp-safe RT60, and no node recreation; run `pnpm test -- schroeder-reverb` RED.
- [ ] Implement persistent four-comb/two-all-pass stereo Schroeder graph with master-safe wet return; wire `AudioEngine.applyAcousticFrame` to taps/reverb.
- [ ] Run `pnpm test -- early-reflection-bank schroeder-reverb audio-engine && pnpm lint && pnpm typecheck && pnpm test`; commit `feat(audio): render reflections and Schroeder reverb`.

### Task 3: Gate C diagnostics, production tests, and human handoff

**Files:**
- Modify: `src/components/workbench/SceneEditor.tsx`, `ReadoutStrip.tsx`, `Transport.tsx`, `EchoWorkbench.tsx`, `src/app/globals.css`
- Create: `tests/e2e/reverb.spec.ts`
- Modify: `docs/STATUS.md`, `docs/ACCEPTANCE_TESTS.md`, `docs/BUILD_CHECKLIST.md`, `README.md`, `docs/DECISION_LOG.md`

- [ ] Write failing production E2E asserting Hard Concrete vs Treated Room RT60/readout/path differences and truthful "first-order"/"approximation" language; run `pnpm e2e --grep "reverb"` RED.
- [ ] Draw top-ranked early reflection paths, show Low/Mid/High RT60 and reflection count, and label estimates/limitations. Display no values until matching frame is available.
- [ ] Update status/checklist only after actual verification; write five human headphone steps: hard vs treated tail, room scale, continuous wall edit, no clicks/runaway feedback, exact diagnostics.
- [ ] Run `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build`; obtain independent whole-Gate-C review; fix all Critical/Important findings; rerun the same commands; commit `feat(ui): expose Gate C reflection diagnostics`.
- [ ] Start production server and request Gate C `PASS`/`FAIL` with URL, five steps, expected result, fresh evidence, and known limitations.
