# Project state — local main

- Updated UTC: 2026-09-23 09:40Z
- Branch/worktree: `main` / primary worktree; S01 integration worktree retained
- Last verified prior commits: local main `668de5f` (S04 handoff); S01 integration `adcc2de`. This merge preserves both histories, including S01 task commit `9820c90`.
- Remote: cached `origin/main` at `0248d79`; freshness UNKNOWN because this task's fetch/push reports `Repository not found`. User will push local main.
- Demo: S05 fixture dashboard at `/overview`, `/forecast`, `/sources`, `/agent-log`; S01 Compose with configured secrets starts PostgreSQL, migrates, serves `/health`, admin login and protected APIs. S04 produced a 24-hour published baseline in its isolated PostgreSQL smoke test. Full real S02/S03 data flow remains unverified.

## Preserved work

- S00 audit `716c63b`: two separate ten-minute CSV histories through 2026-01-31, no February actuals. See `docs/data-contract.md` and `docs/data-audit.md`.
- S01 `49fda2d`, `848bef1`, `bebdcef`, `9820c90`: shared contracts, §7 PostgreSQL migration, Compose persistent volumes, administrator session, protected `/api/v1/*`, separate tick secret, health/assets APIs and S08 server-token bridge.
- S04 `9802da4`: immutable as-of snapshot, baseline, exact 24/48-hour validation, idempotency, previous-version links, transactional PostgreSQL publication and protected forecast API.
- S05 `f3299ee`: Russian dashboard with chart/table, filters, provenance, CSV preview/import UI and agent journal. Real API alignment remains open; see `tests/ui/README.md`.
- S06 `d094908`: nonlinear ridge/power-curve model, train-only scaling, resumable training and durable training-job enqueue; artifacts default to `.data/ml`.
- S07 `564a09e` through `bf4f1fd`: fixture/PostgreSQL job stores, atomic claim, fenced lease/heartbeat/checkpoint, bounded retry, idempotent trigger, agent decisions and replay. Protected tick is still an idle adapter.
- S08 `5ce6748`: sequential backtest, evaluator-only actuals, leakage checks, February metrics, common-pair baseline and CSV export. Registry remains in memory.
- S02/S03 canonical import and weather adapters are not present on this main.

## Decisions and risks

- Source timezone, interval convention, physical power units, normalization, target object, availability and official issue schedule remain unconfirmed. Keep source rows separate and February fact evaluation-only; no MW/MWh conversion or official quality claim.
- S01 proxy requires an admin cookie for all `/api/v1/*`; for S08 routes it forwards server-only `ADMIN_API_TOKEN` after validation. Dispatcher uses `JOB_TICK_SECRET`.
- Root `app/` is the effective App Router. S04/S06/S08 API and S05 UI routes remain.
- S05 real API adapter, S07 tick, S08 production persistence and real S02/S03 inputs await integration.

## Validation

| Check | Result |
|---|---|
| S01 standalone lint, typecheck, build, three auth tests | PASS before merge |
| S01 clean Compose migration and HTTP auth/API smoke with random test secrets | PASS before merge |
| S04 fixture/foundation, PostgreSQL, HTTP, lint/typecheck and webpack build | PASS before this merge, as recorded by S04 owner |
| S05/S06/S07/S08 prior checks | PASS before this merge, as recorded by their owners |
| Combined tests/build/HTTP after these merges | NOT_RUN at user request |
| Merge conflict resolution and staged whitespace check | PASS; package scripts and slice code preserved |
| Remote fetch/push from this task | BLOCKED: `Repository not found`; user requested local main handoff |

## Next actions

1. User pushes local `main` when remote access is ready, then verifies S01 commit `9820c90` and S04 commit `9802da4` are ancestors of `origin/main`.
2. Integrate S02/S03 inputs, align S05 with S04 API and wire S07 tick to S04 publication.
3. Confirm time/power/target semantics and obtain February evaluation-only actuals before official forecast-quality claims.
