# Project state — S07 integration branch

- Updated (UTC): 2026-09-23 09:23Z
- Branch/worktree: `feat/s07-agent` / `.worktrees/s07-agent`
- Base: observed local `origin/main` at `ed2ddf6`; S01 merge is in progress; verify final commit after merge
- Remote freshness: UNKNOWN for this task because `git fetch origin` returns `Repository not found`
- User instruction: integrate into local `main`; user will push it

## Integrated and active work

- Base contains S00 audit, S06 model/training and S08 backtest/evaluation/export. S00 reports two ten-minute CSV histories through 2026-01-31, with unresolved power semantics, timezone and interval convention. February fact is evaluation-only.
- S01 validated schema, auth, health and protected idle tick are being merged here. Its clean Compose/migration/auth checks passed on its branch; tick still requires S07 execution wiring.
- S07 fixture agent and PostgreSQL job queue are implemented. A local PostgreSQL 16 integration test passed claim, lease fencing and checkpoint recovery. The fixture tests passed duplicate event, restart after publication, bounded retry, unavailable inputs, replay and LLM fallback.
- S04 forecast service is in a separate local worktree. S03 is a separate remote branch. S02 implementation has not appeared in the observed base; real S02–S06 connection remains open.

## S07 task and validation

Owner Бибарыс / IN_PROGRESS. Touched: `src/server/jobs/**`, `src/server/agent/**`, `src/server/replay/**`, `scripts/job-dispatcher.mjs`, `tests/agent/**`, S01 tick integration to follow, `docs/progress/bibarys.md`, this file.

- PASS before S01 merge: 7 fixture tests, 1 local PostgreSQL test, TypeScript, lint, `next build --webpack`.
- PASS on S01 branch: clean Compose migration/auth smoke, foundation tests, lint/typecheck/build; see its commit state for commands.
- NOT_RUN after merge: combined suite/build, protected S07 tick, real forecast path.
- BLOCKED: canonical Turbopack build in this worktree because `node_modules` is a junction outside the project root; use local install before final gate.

## Next actions

1. Finish S01 merge, wire the authenticated tick to `JobRunner`, and run combined checks.
2. Connect S04 publication and available S02/S03/S06 services; verify one issuance T, duplicate input and restart.
3. Integrate the validated result into local `main`, preserve other work in STATE.md, and leave push to the user.
