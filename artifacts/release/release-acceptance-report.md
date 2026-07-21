# EchoCanvas Release Acceptance Report

Candidate date: 2026-07-21 (Asia/Taipei)

Branch: `main`

Application commit: `c8fe24700b67861e2f64fbb8950e9281c0e13a3c`

Public deployment: `https://echo-canva.vercel.app`

Static verification: PASS — lint, typecheck, 508 unit tests, production build, and 45/45 Chromium tests

## Gate summary

| Gate | Automated evidence | Human/external evidence | Status |
|---|---|---|---|
| A — repository/static candidate | frozen install, lint, typecheck, 508 unit tests, production build, 45 Chromium tests, diff/secret/dependency checks pass | public GitHub `main`, MIT license, release tag and release page available | PASS |
| B — workbench/basic audio | editor, persistence, transfer, audio lifecycle and production browser regressions exist | prior owner checks accepted positioning, editing, preset changes, mode UI and later workspace flows | PASS locally; final public clean-profile headphone check pending |
| C — acoustics/3D paths | direct/blocked/Portal/first-order/bounded-second-order/RT60/audio-render suites and matched-revision E2E coverage | prior owner acoustic and Hybrid interaction checks recorded PASS in `docs/STATUS.md` | PASS locally |
| D — GPT-5.6 | strict schema/domain/fallback/adversarial/grounding unit and browser coverage | production compile and explanation smoke both returned `openai/gpt-5.6-luna`; no Vercel runtime errors followed | PASS |
| E — submission | README, copy, demo script, public URL, repository, release, security/license and Codex/GPT evidence prepared | public video, screenshots, `/feedback`, final headphone confirmation and Devpost submit remain | PENDING owner actions |

## Prior human evidence retained

- Direct HRTF and editor: PASS, 2026-07-17.
- Occlusion and Portal perception: PASS, 2026-07-17.
- First-order reflections and reverb: PASS, 2026-07-18.
- GPT compiler/explanation including no-key fallback and live Luna compatibility test: PASS, 2026-07-18.
- Hybrid direct 3D occlusion/Portal routing, wall/Portal editing, material contrast, viewport orbit/navigation, XYZ/elevation controls and modelling-workbench interactions: multiple targeted PASS results, 2026-07-18 through 2026-07-19.

These are historical owner observations on the local candidate. They do not substitute for the final clean-device/public-deployment smoke test.

## Internal release artifacts

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/ACCEPTANCE_TESTS.md`
- `artifacts/evidence/CODEX_USAGE.md`
- `artifacts/evidence/GPT_RUNTIME_USAGE.md`
- `artifacts/evidence/DECISION_LOG.md`
- `artifacts/evidence/commit-timeline.csv`
- `artifacts/release/security-license-audit.md`
- `echo-canvas-mvp-submission/04_DEMO_VIDEO_SCRIPT.md`
- `echo-canvas-mvp-submission/05_DEVPOST_SUBMISSION_COPY.md`

## Known non-blocking limitations

- Interactive acoustic approximation only; not architectural-acoustics measurement or certification.
- Portal-aware propagation is geometric/perceptual, not true diffraction.
- Browser HRTF dataset and quality vary by browser/platform.
- Hybrid 3D uses a rectangular room plus bounded finite authoring geometry; arbitrary meshes are not supported.
- First-order paths and bounded second-order paths for blocked direct routes share a fixed six-tap budget. Third- and higher-order reflections and a directional late field remain outside this release.
- Exactly one enabled Listener is rendered at a time.
- Device-local audio is not embedded in JSON and must be relinked in another browser.
- One moderate transitive PostCSS advisory is documented; there are no high or critical advisories.

## Stop-the-line state

No known P0/P1 defect remains in the static or automated production candidate. Final verdict remains **DO NOT SUBMIT YET** until the owner completes the public YouTube video, screenshots, principal `/feedback` Session ID, clean-profile headphone check, and Devpost submission consent.
