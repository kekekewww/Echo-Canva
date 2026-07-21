# EchoCanvas Release Acceptance Report

Candidate date: 2026-07-20 (Asia/Taipei)

Branch: `codex/echo-canvas-mvp`

Static verification: PASS, final captured run

## Gate summary

| Gate | Automated evidence | Human/external evidence | Status |
|---|---|---|---|
| A — repository/static candidate | frozen install, lint, typecheck, 359 unit tests, production build, 38 Chromium tests, diff/secret/dependency checks pass | public deployment not yet attempted | Static portion PASS |
| B — workbench/basic audio | editor, persistence, transfer, audio lifecycle and production browser regressions exist | prior owner checks accepted positioning, editing, preset changes, mode UI and later workspace flows | PASS locally; public clean-profile check pending |
| C — acoustics/3D paths | direct/blocked/Portal/reflection/RT60/audio-render suites and matched-revision E2E coverage | Gate A/B/C plus Hybrid occlusion/Portal/material/UI checks recorded PASS in `docs/STATUS.md` | PASS locally |
| D — GPT-5.6 | strict schema/domain/fallback/adversarial/grounding unit and browser coverage | live `openai/gpt-5.6-luna` compile/explain and 1,000-wall adversarial request recorded PASS on 2026-07-18 | PASS locally; production provider still external |
| E — submission | README, copy, demo script, security/license and Codex/GPT evidence prepared | deployment URL, public video, screenshots, `/feedback`, Devpost submit absent | PENDING external owner actions |

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
- Only first-order paths drive the released reflection visualization/audio contract. Second-order and directional late-field modules remain research/evaluation foundations.
- Exactly one enabled Listener is rendered at a time.
- Device-local audio is not embedded in JSON and must be relinked in another browser.
- One moderate transitive PostCSS advisory is documented; there are no high or critical advisories.

## Stop-the-line state

No known P0/P1 defect remains in the internal static candidate. Final verdict remains **DO NOT SUBMIT YET** until all Gate E public/identity fields are completed and the exact deployed commit passes clean-profile/headphone checks.
