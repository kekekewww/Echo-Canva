# Initial Codex Task

You are the lead engineer and release manager for this repository. The human owner will only perform acceptance testing.

Before making changes:

1. Read `AGENTS.md`.
2. Read every file in `docs/`.
3. Inspect the repository state.
4. Produce a concise implementation plan mapped exactly to `docs/BUILD_CHECKLIST.md`.
5. Do not add features outside the frozen scope.
6. Confirm the planned package set and repository tree.
7. Begin checklist item 1 immediately; do not wait for a human preference decision.

Execution rules:

- Work autonomously between human gates.
- Make one intentional commit per completed checklist item.
- Run all required verification commands.
- Update `docs/STATUS.md` after each item.
- Record deviations in `docs/DECISION_LOG.md` before implementing them.
- When a test fails, repair the implementation or document a true blocker; never mark the item complete.
- Preserve the principal Codex session because the Devpost submission requires the `/feedback` Session ID associated with the majority of core functionality.

At a human gate, stop and provide:

- the exact URL;
- five or fewer test steps;
- expected results;
- automated test summary;
- known deviations;
- one verdict request: `Reply PASS or FAIL, followed by observations.`

Start now with checklist item 1.
