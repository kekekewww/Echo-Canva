# Autonomous Build Checklist

## Operating mode

- Plan owner: Codex.
- Build mode: autonomous.
- Human role: acceptance testing only.
- Human pauses: five gates.
- Git cadence: one commit per completed item.
- Scope is frozen by `AGENTS.md`.

Each item is complete only when its Acceptance and Verify sections pass.

---

- [ ] **1. Bootstrap repository, governance, and test harness**
  Spec ref: `ARCHITECTURE.md > Suggested repository tree`
  What to build: Initialize Next.js/TypeScript/pnpm, strict compiler settings, linting, Vitest, Playwright, CI-compatible scripts, root documentation, status and decision logs. Confirm Codex loads `AGENTS.md`.
  Acceptance: App boots; `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass; one smoke e2e test opens the home page.
  Verify:
  ```bash
  pnpm install
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  pnpm e2e
  ```

- [ ] **2. Implement contracts, registries, validation, and fixtures**
  Spec ref: `API_CONTRACTS.md`
  What to build: TypeScript types, JSON Schema, runtime validator, domain invariants, material/audio registries, three stable preset scenes, import/export, migration shell.
  Acceptance: Valid fixtures pass; invalid IDs, counts, NaN, zero-length walls, self-intersecting outer polygons, and detached portals fail with precise errors.
  Verify:
  ```bash
  pnpm test -- scene
  ```

- [ ] **3. Build the 2D editor and preset workflow**
  Spec ref: `PRD.md > US-01, US-02`
  What to build: SVG editor, coordinate transform, selection, drag listener/source, add/move/delete walls, material inspector, portal open/closed control, Start Audio affordance, Raw/Simulated switch, debug panel shell.
  Acceptance: Preset loads deterministically; editing 100 walls remains responsive; invalid actions do not corrupt state.
  Verify:
  ```bash
  pnpm e2e --grep "editor"
  ```

- [ ] **4. Implement persistent direct-path Web Audio rendering**
  Spec ref: `ARCHITECTURE.md > Audio engine`
  What to build: AudioContext lifecycle, local mono asset loader, source graph pool, HRTF PannerNode, manual distance gain, master limiter, A/B crossfade, parameter smoothing.
  Acceptance: User can hear left/right movement in headphones; repeated Start/Stop does not duplicate sources; no clipping or node leak is visible in diagnostics.
  Verify:
  ```bash
  pnpm test -- audio
  pnpm e2e --grep "audio lifecycle"
  ```
  **Human Gate A:** editor and direct HRTF.

- [ ] **5. Implement robust geometry Worker and direct occlusion**
  Spec ref: `ACOUSTICS.md > 1, 6, 7, 17`
  What to build: segment predicates, visibility, geometry indexing, Worker revision protocol, crossed-wall accumulation, dry gain and low-pass mapping, debug occluder lines.
  Acceptance: Direct line-of-sight produces no occlusion; concrete obstruction visibly and audibly lowers gain/high frequencies; stale Worker frames never overwrite current state.
  Verify:
  ```bash
  pnpm test -- geometry occlusion worker
  ```

- [ ] **6. Implement explicit portal routing**
  Spec ref: `ACOUSTICS.md > 8`
  What to build: portal attachment rules, visibility graph, Dijkstra route, route cost, first-portal virtual panner position, effective distance and loss, route overlay.
  Acceptance: Open portal provides a route when direct path is blocked; closing it removes the route; panner direction is toward the first portal; no route means blocked fallback.
  Verify:
  ```bash
  pnpm test -- portal
  pnpm e2e --grep "portal"
  ```
  **Human Gate B:** occlusion and portal perception.

- [ ] **7. Implement first-order image-source early reflections**
  Spec ref: `ACOUSTICS.md > 9, 11`
  What to build: source reflection across arbitrary wall line, candidate validation, visibility checks, ranking, six-tap fixed pool, reflected panning, debug reflection paths.
  Acceptance: Canonical rectangular fixture yields expected reflection points/path lengths; moving a wall updates taps smoothly; disabled taps are silent without node destruction.
  Verify:
  ```bash
  pnpm test -- image-source early-reflections
  ```

- [ ] **8. Implement room estimation and late reverberation**
  Spec ref: `ACOUSTICS.md > 3, 10, 12`
  What to build: area/perimeter/surface/volume calculations, three-band Eyring RT60, open-portal absorption approximation, pre-delay, stable stereo Schroeder network, damping, reverb sends.
  Acceptance: Hard room has longer/brighter tail than treated room; increased volume increases RT60 under equivalent material conditions; requested decay is approximately reproduced; editing does not glitch.
  Verify:
  ```bash
  pnpm test -- room-acoustics reverb
  pnpm e2e --grep "reverb"
  ```
  **Human Gate C:** reflections and reverb.

- [ ] **9. Implement GPT-5.6 scene compiler**
  Spec ref: `API_CONTRACTS.md > POST /api/scene/compile`
  What to build: server route, strict Structured Outputs, concise prompt, allowed registries, schema/domain validation, one repair pass, rate limit, fallback, prompt fixtures/evals.
  Acceptance: At least 9/10 canonical prompts validate on first call in the recorded evaluation run; all 10 either validate after one repair or safely fall back; no invented material/clip ID reaches client state.
  Verify:
  ```bash
  pnpm test -- ai-scene
  pnpm e2e --grep "scene compiler"
  ```

- [ ] **10. Implement explanation, export, diagnostics, and product polish**
  Spec ref: `PRD.md > US-07, US-08`
  What to build: explanation endpoint, evidence/limitations UI, JSON import/export, debug metrics, onboarding text, headphones notice, loading/error states, keyboard basics, responsive layout.
  Acceptance: Explanation matches exact snapshot values; import round-trip preserves scene; OpenAI outage leaves manual mode operational; no unsupported accuracy claim appears.
  Verify:
  ```bash
  pnpm test
  pnpm e2e
  ```
  **Human Gate D:** GPT compiler and explanation.

- [ ] **11. Stabilize performance, security, compatibility, and deployment**
  Spec ref: `ARCHITECTURE.md > Performance budgets`
  What to build: profiling, remove steady-state allocations, error boundaries, API input limits, server-only key check, production deployment, browser smoke tests, asset/license audit.
  Acceptance: Production URL loads; p95 Worker time is under budget in the 100-wall fixture; no API key is shipped to browser; no uncaught console errors; all tests and production build pass.
  Verify:
  ```bash
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm e2e
  pnpm build
  ```

- [ ] **12. Prepare submission-ready evidence**
  Spec ref: `PRD.md > Track and judging alignment`
  What to build: final README, architecture diagram, test report, setup instructions, supported platforms, public/private repo instructions, licensed assets list, three-minute demo script, screenshots, Codex/GPT-5.6 contribution section.
  Acceptance: A clean-machine tester can access the deployed demo; README states limitations; demo covers the wow moment and Codex/GPT-5.6; principal Codex session remains available for `/feedback`.
  Verify: Execute every case in `ACCEPTANCE_TESTS.md`, record results, and request Human Gate E.
  **Human Gate E:** final release candidate.
