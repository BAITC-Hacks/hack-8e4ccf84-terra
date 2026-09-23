# Project state — S07 branch

- Updated (UTC): 2026-09-23 09:22Z
- Branch/worktree: `feat/s07-agent` / `.worktrees/s07-agent`
- Last verified base: `ed2ddf6` on local `origin/main`; S07 commit is being rebased and its new SHA is not yet verified
- Remote freshness: UNKNOWN for this task because `git fetch origin` returns `Repository not found`; another worktree has advanced the local `origin/main` ref
- Demo: S07 fixture workflow through `node --test tests/agent/workflow.test.cjs`; no deployed end-to-end agent API yet

## Integrated base and other active work

- S00 audit is present in the base. Two ten-minute CSV histories end on 2026-01-31; physical power semantics, timezone, interval convention and weather publication timing remain unresolved.
- S06 training/model implementation and S08 backtest/evaluation/export are present in the observed base. S08 state at `ed2ddf6` reports 6 ML and 13 backtest tests plus lint/build/typecheck passing in its integration worktree. Those checks have not yet been rerun with S07.
- S01 schema/auth/tick and S04 forecast service remain in separate local branches. S03 is a separate remote branch; S02 implementation is not present on the observed base. S04 publication is the intended durable versioning service.

## Active task

S07 / Бибарыс / IN_PROGRESS. Acceptance: atomic claim, lease/heartbeat/checkpoint and bounded retry; idempotent trigger and publication after restart; agent steps and decision journal; replay and LLM fallback; real S02–S06 adapters after their contracts are integrated. Touched: `src/server/jobs/**`, `src/server/agent/**`, `src/server/replay/**`, `scripts/job-dispatcher.mjs`, `tests/agent/**`, `docs/progress/bibarys.md`, this file.

## S07 checks

- PASS: `node --test tests/agent/workflow.test.cjs` — 7 fixture tests for duplicate trigger, restart after saved publication, stale lease, bounded crash/network retry, future inputs and replay.
- PASS: `TEST_DATABASE_URL=postgres://... node --test tests/agent/postgres.test.cjs` — 1 local PostgreSQL 16 integration test for atomic claim, fencing, checkpoint and restart against the S01 table shape.
- PASS: `npx tsc --noEmit --incremental false`; `npm run lint`; `npm run build -- --webpack` before rebase.
- BLOCKED: canonical Turbopack `npm run build` in this worktree because its dependency junction points outside the project root.
- NOT_RUN: combined checks after rebase, real S02–S06 connection, protected HTTP tick, local main integration.

## Next actions

1. Finish rebase and rerun S07 plus combined checks.
2. Connect S01 tick/auth and S04 forecast publication, then the available S02/S03/S06 services; verify one issuance T and a restart.
3. Reconcile state in a separate local main integration worktree and leave the final main push to the user, as requested.
