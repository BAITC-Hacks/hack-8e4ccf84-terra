# Project state — wind forecast agent runtime

- Updated UTC: 2026-09-23 10:59Z.
- Branch/worktree: `chore/integrate-test-login` / private integration worktree; last verified integration commit `69ef6e8` is present on local `main`.
- Base: local `main` at `69ef6e8`; last-known `origin/main` at `f5bd1f9`. Fresh remote fetch/push is BLOCKED because GitHub reports `Repository not found`.
- Verified task commits: agent runtime `8b33b1e`; test login `5a3264f`.
- Active task: editable `test` / `test` development sign-in is integrated into local `main` and validated. Remote publication remains blocked.
- Demo: development server is running from the primary checkout at `http://localhost:3000/login`; `test` / `test` opens `/overview`.

## Integrated implementation

- Preserved S03 Open-Meteo Single Runs connector, provenance/hash and admissible saved-fallback policy. Its persistence adapter remains test-only and is not canonical production weather history.
- Preserved S09 deterministic smoke fixture, fail-closed acceptance harness and reproducibility documentation; these do not prove product acceptance or forecast quality.
- Agent runtime provides protected one-step ticks, durable enqueue/status/journal/cancel APIs, PostgreSQL production ports, publication lease fencing, deterministic data gates, strict-schema OpenAI adapters and durable replay sessions.
- Authentication validates an explicit username and password. Short demo passwords are accepted only outside production; production still requires a non-placeholder password of at least 12 characters.

## Validation

- PASS after latest-main reconciliation: foundation (4), agent (12), replay (1), weather (25), acceptance (2), `npm test` (31), lint, typecheck and production build.
- PASS manual HTTP flow: `test` / `test` returns 200, authenticated `/overview` returns 200, and a wrong username returns 401.
- PASS for agent runtime on local `main`: foundation, agent, replay, forecast, weather and acceptance suites; lint, typecheck, production build and disposable PostgreSQL 16 integration.
- BLOCKED: real OpenAI smoke without explicit opt-in and a verified key/model.
- BLOCKED: real February historical E2E until trustworthy archival forecasts and February actuals exist in canonical storage.
- BLOCKED: remote fetch/push because `origin` responds with `Repository not found`.

## Decisions and boundaries

- Test credentials are configured only in ignored local `.env.local`; no credential is committed.
- The primary forecast path does not evaluate future actuals before publication. Durable actual-arrival evaluation remains follow-up work.
- S03 connector output must be integrated into canonical `weather_runs`/`weather_values` before production agent use.

## Next actions

1. When GitHub access returns, fetch/reconcile and push local `main` to `origin/main`, then verify `5a3264f` ancestry.
2. Preserve the ignored local `.env.local` development credentials when moving or recreating the demo environment.
3. Integrate S03 output into canonical weather tables, add actual-arrival evaluation, then run historical and opt-in OpenAI smoke gates.
