# Codex Defect-Recovery Prompt

Treat the following human report as an acceptance-test failure, not a request for scope expansion.

1. Reproduce the failure.
2. Identify whether the fault is in UI state, geometry, Worker synchronization, audio parameter mapping, DSP, model validation, or deployment.
3. Add or strengthen an automated regression test before or with the fix.
4. Apply the minimum change that restores the specified acceptance criterion.
5. Run the full task verification suite.
6. Update `docs/STATUS.md` and, if architecture changed, `docs/DECISION_LOG.md`.
7. Re-present only the failed human gate.

Human report:

[PASTE FAILURE OBSERVATION HERE]
