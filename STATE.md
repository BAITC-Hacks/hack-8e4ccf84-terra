# Project state — agent runtime and remediation specification

- Updated UTC: 2026-09-23 11:16Z
- Branch/worktree: local `main` / primary checkout; final integration was prepared in `chore/integrate-agent-remediation-spec-final`.
- Base: `origin/main` remains at `50ad10b`; local `main` contains integration commit `ebdcef1`, task branch `f991a52`, and documentation commit `c406869`.
- Owner/status: Codex; all merge conflicts are resolved and the remediation specification is present on clean local `main`. Per the user's instruction, `origin/main` was not updated and no additional checks were started.
- Active task: publish `docs/agent-subsystem-remediation-spec.md` without regressing the agent runtime or development sign-in already present on `main`.

## Integrated implementation

- Preserved the protected one-step agent tick, durable enqueue/status/journal/cancel APIs, PostgreSQL production ports, replay sessions, deterministic data gates, strict-schema OpenAI adapters, and publication lease fencing.
- Preserved explicit username/password authentication. Short demo passwords remain allowed only outside production; production still requires a non-placeholder password of at least 12 characters.
- Added `docs/agent-subsystem-remediation-spec.md`, an implementation and acceptance reference originally audited against base `501839e`.
- The specification is a design record; current implementation status is determined by the code, tests, and this handoff. Runtime and authentication code are unchanged by the documentation task.

## Validation

- PASS on the task branch after latest-main reconciliation: `npm test` (31), foundation (4), agent (12), replay (1), forecast (6), weather/acceptance (27), lint, typecheck, and production build.
- PASS previously on `main`: manual `test` / `test` sign-in and disposable PostgreSQL agent integration.
- PASS in the final private integration worktree before the user stopped further checks: `npm test` (31), foundation (4), agent (12), replay (1), lint, and typecheck.
- NOT_RUN to completion: final production build was interrupted when the user requested no further checks.
- BLOCKED: real OpenAI smoke without explicit opt-in and a verified key/model.
- BLOCKED: real February historical E2E until trustworthy archival forecasts and February actuals exist in canonical storage.

## Decisions and boundaries

- Test credentials are configured only in ignored local `.env.local`; no credential is committed.
- `ForecastService.run` is not used as intermediate inference because it publishes; the agent uses underlying snapshot/inference/store boundaries.
- Only the existing persistence model has a runtime inference adapter. Other approved artifacts fail explicitly with `MODEL_INFERENCE_NOT_IMPLEMENTED`.
- Primary forecast does not evaluate future actuals before publication; durable actual-arrival evaluation remains follow-up work.
- S03 connector output must be integrated into canonical `weather_runs`/`weather_values` before production historical agent use.

## Next actions

1. Keep `origin/main` unchanged until a later explicit remote-push request.
2. When remote publication is requested, fetch/reconcile, run the required checks, push, and verify `c406869` ancestry.
3. Continue remaining runtime follow-ups: canonical weather persistence, actual-arrival evaluation, and historical/OpenAI smoke gates.
