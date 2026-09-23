# Project state — local main handoff

- Updated UTC: 2026-09-23 09:35Z
- Branch/worktree: `chore/integrate-s01-local` / `.worktrees/s01-integration`
- Last verified prior commits: S01 integration `6c672de`; local main `0248d79` (S05/S07 and S01 content). This merge reconciles both histories.
- Remote: cached `origin/main` at `1a91e23`; freshness UNKNOWN because this task's fetch/push reports `Repository not found`. User will push local main.
- Demo: S05 fixture dashboard at `/overview`, `/forecast`, `/sources`, `/agent-log`. S01 Compose with configured secrets starts PostgreSQL, migrates, serves `/health`, admin login and protected assets/tick APIs. Real E4 forecast flow remains unintegrated.

## Preserved work

- S00 audit `716c63b`: two separate ten-minute CSV histories through 2026-01-31, no February actuals. See `docs/data-contract.md` and `docs/data-audit.md`.
- S06 `d094908`: nonlinear ridge/power-curve model, train-only scaling, resumable training and durable training-job enqueue. Artifacts default to `.data/ml`.
- S08 `5ce6748`: sequential backtest, evaluator-only actuals, leakage checks, February MAE/RMSE/N/coverage, common-pair baseline and CSV export. Registry is an in-memory adapter.
- S05 `f3299ee`: Russian dashboard with filters, chart/table, provenance, CSV import preview and agent journal. Real API adapter alignment remains open; see `tests/ui/README.md` and `docs/handoffs/kassym-s05.md`.
- S01 `49fda2d`, `848bef1`, `bebdcef`, `9820c90`: shared contracts, §7 PostgreSQL migration, Compose persistent volumes, administrator session, protected `/api/v1/*`, separate tick secret, health/assets APIs and S08 server-token bridge.
- S07 `564a09e` through `bf4f1fd`: fixture/PostgreSQL job stores, atomic claim, fenced lease/heartbeat/checkpoint, bounded retry, idempotent trigger, agent decisions and replay. Dispatcher calls the protected tick endpoint; tick is still an idle adapter.
- S04 remains in a separate worktree. Its forecast publication has not been integrated.

## Decisions and risks

- Source timezone, interval convention, physical power units, normalization, target object, availability and official issue schedule remain unconfirmed. Keep source rows separate and February fact evaluation-only. S01 stores unknowns as nullable/configurable values.
- S01 proxy requires an admin cookie for all `/api/v1/*`; for S08 routes it forwards server-only `ADMIN_API_TOKEN` after validation. Browsers do not receive that token. Dispatcher uses `JOB_TICK_SECRET`.
- Root `app/` is the effective App Router. S06/S08 API bridges and S05 UI route bridges remain.
- No end-to-end automatic forecast or real February model-quality result is claimed.

## Validation

| Check | Result |
|---|---|
| S01 standalone lint, typecheck, build, three auth tests | PASS before merge |
| S01 clean Compose migration and HTTP auth/API smoke with random test secrets | PASS before merge |
| S05/S06/S08 prior checks | PASS before this merge, as recorded by their owners |
| S07 fixture 7 tests, PostgreSQL adapter 1 test, combined pre-S05 lint/build | PASS before this merge, as recorded by S07 owner |
| Combined tests/build/HTTP after S01+S05+S07 merge | NOT_RUN at user request |
| Conflict and staged whitespace check | PASS; package scripts and all slice code preserved |
| Remote fetch/push from this task | BLOCKED: `Repository not found`; user requested local main handoff |

## Next actions

1. Commit this conflict resolution and fast-forward local `main` to the merged result. User will push.
2. Connect S04 publication and S02/S03 inputs through S01 contracts; align S05 API and S07 tick after E4.
3. Confirm time/power/target semantics and obtain February evaluation-only actuals before official forecast-quality claims.
