# Project state — local integration

- Updated UTC: 2026-09-23 09:31Z
- Branch/worktree: `chore/integrate-s01-local` / `.worktrees/s01-integration`
- Last verified prior commits: S01 merge `e3a9553`, local main `1a91e23` (S05 and S08). This merge reconciles both.
- Remote: latest fetched `origin/main` is `1a91e23`, but freshness is UNKNOWN for this task because its fetch/push attempts return `Repository not found`. User will push local main.
- Demo: S05 fixture dashboard at `/overview`, `/forecast`, `/sources`, `/agent-log`; S01 Compose with configured secrets starts PostgreSQL, migrates, serves `/health`, admin login and protected assets/tick APIs. Real E4 forecast flow is not yet integrated.

## Preserved work

- S00 audit `716c63b`: two separate ten-minute CSV histories through 2026-01-31, no February actuals. `docs/data-contract.md` and `docs/data-audit.md` define verified mapping and open semantics.
- S06 `d094908`: nonlinear ridge/power-curve model, train-only scaling, resumable training and durable training-job enqueue. Artifacts default to `.data/ml`; dispatcher and real-data quality remain unverified.
- S08 `5ce6748`: sequential backtest, evaluator-only actuals, leakage checks, February MAE/RMSE/N/coverage, baseline common pairs and CSV export. Registry is an in-memory integration adapter.
- S05 `f3299ee`: Russian dashboard with filters, chart/table, provenance, CSV preview/import mapping, agent journal and fixture/mock API. Real API adapter alignment remains open; `tests/ui/README.md` and `docs/handoffs/kassym-s05.md` describe its gate.
- S01 `49fda2d`, `848bef1`, `bebdcef`, `9820c90`: shared contracts, §7 PostgreSQL migration, Compose persistent volumes, administrator session, protected `/api/v1/*`, separate tick secret, health/assets APIs and S08 server-token bridge.
- S04 and S07 remain active in separate worktrees. S01 tick is a protected idle adapter until S07 integration; S04 forecast publication is not yet on this main.

## Decisions and risks

- Do not infer source timezone, interval convention, physical power units, normalization, target object, availability or official issue schedule. Keep source rows separate and February fact evaluation-only. S01 stores these unknowns as nullable/configurable values.
- S01 proxy requires an admin cookie for all `/api/v1/*`; for S08 routes it forwards server-only `ADMIN_API_TOKEN` after validation. Browsers do not receive that token.
- Root `app/` is the effective App Router. S06/S08 API bridges and S05 UI route bridges remain.
- S05 and S08 prior integrated checks are recorded in their commits/previous STATE.md. Their real E4 flow remains unverified.

## Validation

| Check | Result |
|---|---|
| S01 standalone lint, typecheck, build, three auth tests | PASS before merge |
| S01 clean Compose migration and HTTP auth/API smoke with random test secrets | PASS before merge |
| S05/S06/S08 checks | PASS before this merge, as recorded by their owners |
| Combined tests/build/HTTP after S01+S05 merge | NOT_RUN at user request |
| Conflict and staged whitespace check | PASS; package scripts from S06 and S01 preserved |
| Remote fetch/push from this task | BLOCKED: `Repository not found`; local main handoff requested |

## Next actions

1. Commit this conflict resolution and fast-forward local `main` to the merged result. User will push.
2. Connect S04/S07/S02/S03 modules through S01 contracts as their branches land; align S05 real API adapter after E4.
3. Obtain confirmed time/power/target semantics and February evaluation-only actuals before an official forecast-quality claim.
