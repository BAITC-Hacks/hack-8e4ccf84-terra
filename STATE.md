# Project state — backend specification audit

- Updated UTC: 2026-09-23 11:12Z
- Branch/worktree: `fix/backend-spec-audit` / `hack-8e4ccf84-terra-worktrees/backend-spec-audit`
- Base: latest fetched `origin/main` at `50ad10b`; audit branch is cleanly rebased and ready to push.
- Owner/status: Codex; confirmed forecast-integrity fixes implemented and validated; remote integration pending.

## Current implementation

- Preserved the integrated test-login behavior and durable wind-agent runtime: enqueue/status/journal/cancel APIs, protected one-step dispatcher, lease-fenced publication, transactional checkpoints, bounded retries, replay sessions, and deterministic gates.
- Preserved the S03 Open-Meteo Single Runs connector and saved provenance evidence. Its local repository is not a production adapter for canonical PostgreSQL weather tables.
- CSV import now mirrors accepted training rows transactionally into canonical `observations`; evaluation-only targets remain isolated. Migration `0002_bridge_import_observations.sql` backfills existing accepted training rows.
- Forecast publication rejects any output unit other than `normalized`; weather without `published_at` is eligible only with an explicit availability assumption.
- Backtest leakage validation enforces `target_time = issued_at + lead_hour` exactly.
- Compose includes an application healthcheck. Detailed evidence and gaps are in `docs/backend-spec-audit.md`.

## Validation

- PASS after latest rebase: core (32), foundation (4), agent (12), replay (1), weather (25), forecast (7), lint, typecheck, and production build.
- PASS before latest rebase (unaffected): acceptance harness (2).
- PASS before latest rebase: Compose config/build/startup and application/database healthchecks; `/api/health` returned `database=ready`.
- PASS before latest rebase: disposable PostgreSQL 16 migrations; CSV import produced three canonical observations and a persisted 24-point forecast; a separate clean database passed agent claim/fencing/checkpoint/restart integration.
- FAIL (pre-existing, unrelated): UI localization suite reports missing English/Kazakh translation for Russian `Проверяем…`; this branch does not change frontend/i18n.
- EXPECTED BLOCKED: `node tests/acceptance/run.mjs verify` reports missing `demo:verify`; the fail-closed harness itself passes.
- BLOCKED by missing inputs: official February evaluation and forecast-quality metrics; supplied CSVs end on 2026-01-31 23:50 and contain no February actuals.
- BLOCKED by provenance: historical Open-Meteo availability time is not provider-proven, and turbine mapping/time semantics remain unconfirmed.
- SKIP unless explicitly configured: live OpenAI smoke (`RUN_OPENAI_SMOKE=1` plus a verified model/key).

## Decisions and constraints

- Official specification v1.1 SHA-256: `6785661fbe95c0ee385b6740ca42cc6b2748e208c2802e9f34e7cfc9a6fb3974`.
- No actual/reanalysis weather may substitute for unavailable historical forecasts.
- Unknown publication time is not inferred from model run time; eligibility requires a recorded assumption.
- Only `data_use=training` is bridged into canonical observations.
- Only the persistence model currently has production inference support; unsupported artifacts fail explicitly.
- Candidate coordinates from the supplied PDF are not treated as confirmed physical asset configuration.
- Development `test` credentials remain local-only and are not committed.

## Next actions

1. Push `fix/backend-spec-audit`, then merge it from a private integration worktree into the latest `origin/main`.
2. Verify the task commit and canonical state are present on remote `main`.
3. After owner data is available, confirm turbine/time/power semantics, persist trustworthy archival forecast runs, and execute the February replay/evaluation.
