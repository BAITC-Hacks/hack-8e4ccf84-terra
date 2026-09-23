# Project state — wind forecast agent runtime

- Updated UTC: 2026-09-23 10:47Z
- Branch/worktree: `feat/wind-forecast-agent` / `.worktrees/wind-forecast-agent`
- Base: locally available `origin/main` at `0433640`; fresh remote fetch remains BLOCKED (`Repository not found`).
- Last verified task commit: rebase in progress; use `uncommitted` until post-rebase checks complete.
- Owner/status: Codex; agent runtime slice implemented and pre-rebase validation passed. Combined validation is next.

## Integrated implementation

- Preserved S03 Open-Meteo Single Runs connector, provenance/hash and admissible saved-fallback policy from the updated base. Its persistence adapter is still test-only and is not silently treated as canonical production weather history.
- Preserved S09 deterministic smoke fixture, fail-closed acceptance harness and reproducibility documentation; these do not prove product acceptance or forecast quality.
- Added protected one-step agent tick, durable enqueue/status/journal/cancel APIs and PostgreSQL production ports over canonical observations, weather runs, snapshots and forecast versions.
- Publication checks the current job lease while holding the job row in the forecast transaction. Checkpoint advancement and completion/fallback event share one JobStore transaction.
- Heartbeat failure and tick budget abort commit; cancellation invalidates the lease and is rejected once publication has committed.
- Deterministic gates cover as-of availability, asset, weather coverage, units, quality, evaluation-only leakage, exact 24/48 horizons and finite unique points.
- Added strict-schema OpenAI decision/briefing adapters with bounded configuration and explicit deterministic fallback.
- Added durable replay session, virtual clock/cursor and atomic due-event enqueue APIs.

## Validation

- PASS before rebase: `npm test` (28), `npm run test:foundation` (3), `npm run test:agent` (12), `npm run test:agent:replay` (1), forecast service tests (6), lint, typecheck and production build.
- PASS before rebase: disposable PostgreSQL 16 integration using real `0001_foundation.sql` and `0002_agent_replay.sql`; claim/fencing/atomic journal/cancel/replay restart passed and the container was removed.
- Preserved-base PASS: S03 weather offline tests (25) and S09 harness tests (2), per the reconciled base handoff.
- PENDING: combined post-rebase regression/build.
- SKIP: real OpenAI smoke; no `RUN_OPENAI_SMOKE=1` plus verified account model/key.
- BLOCKED: real February historical E2E until trustworthy archival forecast runs are persisted in the canonical S01 tables.
- BLOCKED: February evaluation because supplied CSVs contain no February actuals.

## Decisions and boundaries

- `ForecastService.run` is not used as intermediate inference because it publishes; the agent uses underlying snapshot/inference/store boundaries.
- Only the existing persistence model has a runtime inference adapter. Other approved artifacts fail explicitly with `MODEL_INFERENCE_NOT_IMPLEMENTED`.
- Primary forecast no longer evaluates future actuals before publication. A separate durable actual-arrival evaluation workflow remains follow-up work.
- Demo `src/agent` is not the wind runtime entrypoint.
- S03 connector output must be integrated into canonical `weather_runs`/`weather_values` before production agent use.

## Next actions

1. Complete rebase and run combined agent, weather, acceptance, lint, typecheck and build checks.
2. Create a private local integration worktree, merge the validated task, update canonical state and fast-forward local `main` under the remote-unavailable fallback.
3. When GitHub access returns, fetch/reconcile, push the task branch and local integration to `origin/main`, then verify ancestry.
