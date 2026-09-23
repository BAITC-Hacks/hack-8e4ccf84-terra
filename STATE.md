# Project state — agent runtime and remediation specification

- Updated UTC: 2026-09-23 11:06Z
- Branch/worktree: `docs/agent-remediation-spec` / isolated task worktree.
- Base: current `origin/main` at `f5bd1f9` merged into the task branch; documentation commit `c406869` retained.
- Owner/status: Codex; the `STATE.md` merge conflict is resolved and the reconciled task branch is validated. Branch push and integration into `origin/main` are pending.
- Active task: publish `docs/agent-subsystem-remediation-spec.md` without regressing the agent runtime already present on `main`.

## Integrated implementation

- Preserved the protected one-step agent tick, durable enqueue/status/journal/cancel APIs, PostgreSQL production ports, replay sessions, virtual clock/cursor, and atomic due-event enqueue APIs from `origin/main`.
- Preserved deterministic availability, asset, weather coverage, unit, quality, leakage, horizon, and finite-point gates.
- Preserved strict-schema OpenAI decision/briefing adapters with bounded configuration and deterministic fallback.
- Added `docs/agent-subsystem-remediation-spec.md`, an implementation and acceptance reference originally audited against base `501839e`.
- The specification is a design record; current implementation status is determined by the code, tests, and this handoff. Runtime code is unchanged by the documentation commit.

## Validation

- PASS on `origin/main` before this documentation merge: unit/foundation/agent/replay/forecast/weather/acceptance suites, lint, typecheck, production build, and disposable PostgreSQL integration.
- PASS: the documentation commit applies cleanly after resolving only `STATE.md`; no runtime source conflict was introduced.
- PASS after conflict resolution: `npm test` (31), `npm run test:foundation` (3), `npm run test:agent` (12), `npm run test:agent:replay` (1), forecast service tests (6), weather/acceptance tests (27), lint, typecheck, and production build.
- SKIP: real OpenAI smoke without `RUN_OPENAI_SMOKE=1` and a verified account model/key.
- BLOCKED: real February historical E2E until trustworthy archival forecast runs are persisted in canonical weather tables.
- BLOCKED: February evaluation because supplied CSVs contain no February actuals.

## Decisions and boundaries

- `ForecastService.run` is not used as intermediate inference because it publishes; the agent uses underlying snapshot/inference/store boundaries.
- Only the existing persistence model has a runtime inference adapter. Other approved artifacts fail explicitly with `MODEL_INFERENCE_NOT_IMPLEMENTED`.
- Primary forecast does not evaluate future actuals before publication; a separate durable actual-arrival evaluation workflow remains follow-up work.
- S03 connector output must be integrated into canonical `weather_runs`/`weather_values` before production historical agent use.

## Next actions

1. Commit and push the reconciled `docs/agent-remediation-spec` branch.
2. Merge it from a private integration worktree based on the latest `origin/main`, rerun critical checks, and push `main`.
3. Verify the documentation commit is an ancestor of `origin/main`.
