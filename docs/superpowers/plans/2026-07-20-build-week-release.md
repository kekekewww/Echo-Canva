# Build Week Release Completion Plan

> **For Codex:** Execute each task in order, keep external publishing actions pending, and do not claim human or deployment evidence that has not been observed.

**Goal:** Reconcile the supplied MVP submission package with the verified Echo Canvas 2.5D/3D release candidate, produce submission-ready evidence, and finish with the repository's complete static verification gate passing.

**Architecture:** The application remains the existing unified Next.js workbench. This phase changes release documentation, evidence, and bounded release checks only; it does not roll back verified Hybrid 3D features or alter deterministic acoustic/audio contracts. Public deployment, video upload, Devpost submission, and `/feedback` remain explicit owner-operated gates.

**Tech Stack:** Markdown, JSON, PowerShell/CLI release checks, pnpm, ESLint, TypeScript, Vitest, Next.js production build, Playwright.

---

### Task 1: Reconcile release scope and submission language

**Files:**
- Modify: `docs/DECISION_LOG.md`
- Modify: `echo-canvas-mvp-submission/01_RELEASE_SCOPE.md`
- Modify: `echo-canvas-mvp-submission/03_FINAL_ACCEPTANCE_MATRIX.md`
- Modify: `echo-canvas-mvp-submission/05_DEVPOST_SUBMISSION_COPY.md`
- Modify: `echo-canvas-mvp-submission/06_REPOSITORY_README_TEMPLATE.md`
- Modify: `echo-canvas-mvp-submission/09_RELEASE_RISKS_AND_ROLLBACK.md`

1. Record why the stale 2D-only release snapshot is being reconciled instead of used to remove accepted 3D work.
2. Replace obsolete exclusions and roadmap claims with the current bounded Hybrid 3D capability and honest limitations.
3. Preserve the approved product language and avoid physical-accuracy claims.
4. Run `git diff --check`.

### Task 2: Complete security, license, asset, and dependency audit

**Files:**
- Modify: `echo-canvas-mvp-submission/08_LICENSE_ASSET_SECURITY_AUDIT.md`
- Create: `artifacts/release/security-license-audit.md`
- Modify if required: `.env.example`, `README.md`, or relevant tests

1. Confirm only `.env.example` is tracked and no credential-shaped value is committed.
2. Confirm server-only provider access, prompt limit, rate limiting, strict schema/domain validation, and local-asset boundaries from code/tests.
3. Confirm application and generated audio licensing.
4. Run package audit and record results without exposing environment values.
5. Fix only verified release-blocking defects and add regression tests first if code changes are needed.

### Task 3: Assemble truthful Codex/GPT and submission evidence

**Files:**
- Create: `artifacts/evidence/CODEX_USAGE.md`
- Create: `artifacts/evidence/GPT_RUNTIME_USAGE.md`
- Create: `artifacts/evidence/DECISION_LOG.md`
- Create: `artifacts/evidence/commit-timeline.csv`
- Create: `artifacts/release/submission-metadata.json`
- Modify: `echo-canvas-mvp-submission/07_CODEX_AND_GPT_EVIDENCE.md`
- Modify: `echo-canvas-mvp-submission/04_DEMO_VIDEO_SCRIPT.md`
- Modify: `README.md` if release-facing gaps remain

1. Document Codex's implemented vertical slices with traceable commits and tests.
2. Document GPT-5.6's bounded runtime role and no-key fallback.
3. Produce a concise commit timeline from repository history.
4. Fill only metadata known from the repository; leave external URLs/session ID clearly pending.
5. Update the demo script to show both 2.5D and Hybrid 3D without exceeding three minutes.

### Task 4: Produce the release acceptance report

**Files:**
- Create: `artifacts/release/release-acceptance-report.md`
- Create: `artifacts/release/rc-metadata.json`
- Modify: `docs/BUILD_CHECKLIST.md`
- Modify: `docs/STATUS.md`

1. Map Gates A-E to automated, prior human, and still-pending evidence.
2. Do not convert prior PASS statements into claims for untested deployment or video assets.
3. Mark internal checklist items complete only after their evidence exists.
4. Record external owner actions separately.

### Task 5: Run final static verification and freeze the internal candidate

**Files:**
- Create: `artifacts/release/verify-output.txt`
- Create: `artifacts/release/e2e-output.txt`
- Create: `artifacts/release/static-verification-summary.md`
- Modify: `docs/STATUS.md`
- Modify: `artifacts/release/rc-metadata.json`

1. Stop any reused development server so Playwright owns its test server.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm e2e`, capturing complete command output.
3. Run `git diff --check`, tracked-secret boundary checks, and final working-tree review.
4. Update the summary with exact counts and results.
5. Commit the completed static release slice; do not deploy, push, tag, upload video, submit Devpost, or fabricate `/feedback` evidence.
