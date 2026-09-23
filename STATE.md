# Project state — S04 branch

- Updated (UTC): 2026-09-23 09:26Z
- Branch/worktree: `feat/s04-forecast-baseline` / `.worktrees/s04-forecast`
- Last verified prior commit: `6bb3f7a` (S01 dependency); S04 changes are uncommitted
- Remote: cached `origin/main` at `0d251d6`; fetch reports `Repository not found`, so freshness is UNKNOWN
- Demo: local Next.js production server at `http://127.0.0.1:3001` against isolated S04 PostgreSQL; authenticated baseline request returned 24 published points. This is a temporary test stack, not a deployment.

## Active task

S04 / owner this branch / VALIDATED locally. Acceptance: as-of immutable input snapshot, eligible persistence baseline, exact 24/48 hourly points, model/weather/revision links, idempotent versioned atomic publication, explicit incomplete status, protected forecast API. Touched: `src/server/data/snapshot/**`, `src/server/ml/baseline/**`, `src/server/forecast/**`, `app/api/v1/forecast-jobs/**`, `app/api/v1/forecasts/**`, `tests/forecast/**`. S01 contracts/schema/auth commits are included as dependencies.

## Verified decisions

- Target hours use UTC whole-hour `T+1h` through `T+N h`; the source interval convention is still awaiting S00 confirmation. No MW/MWh conversion or `[0,1]` clipping occurs.
- Backtest `history_only` cannot read February 2026 observations. Forecast production rejects `evaluation_only`. Every observation and weather run must have known `available_at <= T`; weather must cover every target hour. Baseline persistence uses the last eligible normalized-power observation and requires a complete eligible weather run.
- Snapshot payload stores selected input values and provenance, detached from reader objects; SHA-256 participates in the idempotency key. PostgreSQL writes snapshot, run, and all values in one transaction under a series advisory lock; incomplete runs hold no forecast values.
- S02/S03 modules are not yet present. S04 reads their canonical `observations` and `weather_runs`/`weather_values` tables through S01 typed reader contracts. Live CSV import and weather adapter validation remain external dependencies.
- The POST route currently computes the short baseline synchronously. S07 owns queued `JobStep` orchestration and should invoke the same `ForecastService.run` path when available.
- User explicitly requested local `main` integration and will push personally; no Git push should be attempted for this task.

## Checks

| UTC | Check | Result |
|---|---|---|
| 09:26 | final eslint, typecheck, fixture/foundation tests, webpack build | PASS: 8 tests, lint, typecheck, full build |
| 09:23 | `node --test tests/forecast/postgres.test.cjs` with isolated PostgreSQL and S01 migration | PASS: atomic rollback, retry, new version, future fact guard |
| 09:21 | HTTP smoke of production build | PASS: anonymous 401, login 200, POST 201, GET 200, retry same ID, invalid horizon 400 |
| 09:20 | `eslint .`, `tsc --noEmit -p tsconfig.json`, fixture and foundation tests | PASS |
| 09:19 | `next build --webpack` | PASS: forecast routes and proxy compiled |
| 09:18 | default Turbopack build in worktree | BLOCKED: local `node_modules` junction points outside Turbopack filesystem root; webpack build passes |
| 09:12 | `git fetch --all --prune` | BLOCKED: remote returns `Repository not found` |

## Blockers and risks

- Remote access is unavailable; user will push local `main` after integration. Next action: verify origin access and push when available.
- S00 has not confirmed source interval convention, normalized power semantics, or whether line power is shared. Do not export MW/MWh or treat shared line power as independent turbine targets until confirmed.
- Real S02 import and S03 weather adapter are not yet present. Recheck their metric/quality vocabulary and weather publication rule when merged.

## Next actions

1. Re-run final S04 tests, lint, typecheck, and webpack build after the last code edit; review staged diff and commit S04.
2. Integrate the validated S04 branch from a separate worktree, then update local `main` without pushing, per the user's request.
3. After S02/S03/S07 land, run a real data forecast and wire queued `JobStep` execution to `ForecastService.run`.
