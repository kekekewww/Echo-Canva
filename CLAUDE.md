# CLAUDE.md

**Read [`AGENTS.md`](./AGENTS.md) in full before any implementation, edit, command, review, or delegated task.**

`AGENTS.md` is the single source of truth for agent behaviour in this repository — mission, non-negotiable product scope, required stack, architecture constraints, limits, quality gates, documentation duties, git discipline, and autonomous execution policy. If it defines a pre-task memory or preflight protocol, run that before changing any project state.

This file exists only to point at `AGENTS.md`. Do not duplicate its rules here, and do not treat this file as a substitute for reading it — it is kept deliberately short so it cannot drift out of sync.

## Precedence

1. Direct instructions from the user in the current session.
2. `AGENTS.md` (repository root).
3. Canonical product contracts: `docs/DECISION_LOG.md`, `docs/STATUS.md`, specs and contracts, then implementation and tests.
4. This file.

## Scoped instructions

Additional `AGENTS.md` files exist in subdirectories. When working inside one, read it in addition to the root file; the root file still governs.
