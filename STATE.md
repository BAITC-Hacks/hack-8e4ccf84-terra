# Project state — agent runtime and remediation specification

- Updated UTC: 2026-09-23 11:09Z
- Branch/worktree: `docs/agent-remediation-spec` / isolated task worktree.
- Base: current `origin/main` at `69ef6e8` merged into the task branch; documentation commit `c406869` retained.
- Owner/status: Codex; repeated `STATE.md` conflicts are resolved while preserving the latest test-login and agent-runtime state. The reconciled branch is validated; the updated branch push is pending.
- Active task: publish `docs/agent-subsystem-remediation-spec.md` without regressing the runtime or authentication changes already present on `main`.

## Integrated implementation

- Preserved the protected one-step agent tick, durable enqueue/status/journal/cancel APIs, PostgreSQL production ports, replay sessions, deterministic data gates, strict-schema OpenAI adapters, and publication lease fencing from `origin/main`.
- Preserved explicit username/password authentication. Short demo passwords remain allowed only outside production; production still requires a non-placeholder password of at least 12 characters.
- Added `docs/agent-subsystem-remediation-spec.md`, an implementation and acceptance reference originally audited against base `501839e`.
- The specification is a design record; current implementation status is determined by the code, tests, and this handoff. Runtime and authentication code are unchanged by the documentation commit.

## Validation

- PASS on `origin/main` before this documentation merge: foundation (4), agent (12), replay (1), weather (25), acceptance (2), `npm test` (31), lint, typecheck, production build, manual `test` / `test` sign-in, and disposable PostgreSQL integration.
- PASS on the first conflict resolution against `f5bd1f9`: `npm test` (31), foundation (3), agent (12), replay (1), forecast (6), weather/acceptance (27), lint, typecheck, and production build.
- PASS after incorporating `origin/main` at `69ef6e8`: `npm test` (31), foundation (4), lint, typecheck, and production build.
- BLOCKED: real OpenAI smoke without explicit opt-in and a verified key/model.
- BLOCKED: real February historical E2E until trustworthy archival forecasts and February actuals exist in canonical storage.

## Decisions and boundaries

- Test credentials are configured only in ignored local `.env.local`; no credential is committed.
- `ForecastService.run` is not used as intermediate inference because it publishes; the agent uses underlying snapshot/inference/store boundaries.
- Only the existing persistence model has a runtime inference adapter. Other approved artifacts fail explicitly with `MODEL_INFERENCE_NOT_IMPLEMENTED`.
- Primary forecast does not evaluate future actuals before publication; durable actual-arrival evaluation remains follow-up work.
- S03 connector output must be integrated into canonical `weather_runs`/`weather_values` before production historical agent use.

## Next actions

1. Commit the latest-main reconciliation and push `docs/agent-remediation-spec`.
2. Merge it from a private integration worktree based on the latest `origin/main`, rerun critical checks, and push `main`.
3. Verify `c406869` is an ancestor of `origin/main`.
