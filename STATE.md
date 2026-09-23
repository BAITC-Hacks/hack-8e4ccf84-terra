# Project state — overview redesign implementation

- Updated UTC: 2026-09-23 11:45Z
- Branch/worktree: `chore/integrate-terra-overview` / private integration worktree.
- Base/integration: task commit `e9dfb21` merged over local `main` at `4ed268c`; merge commit `04879a4`. `origin` is unavailable (`Repository not found`).
- Owner/status: Codex; overview implementation is committed, locally integrated, and production build passes. Remote synchronization is blocked.

## Integrated implementation

- Preserved explicit development sign-in, the durable wind-agent runtime, and `docs/agent-subsystem-remediation-spec.md` from current `main`.
- Preserved the S03 Open-Meteo Single Runs connector and saved provenance evidence. Its local repository is not a production adapter for canonical PostgreSQL weather tables.
- CSV import now mirrors accepted training rows transactionally into canonical `observations`; evaluation-only targets remain isolated. Migration `0002_bridge_import_observations.sql` backfills existing accepted training rows.
- Forecast publication rejects any output unit other than `normalized`; weather without `published_at` is eligible only with an explicit availability assumption.
- Backtest leakage validation enforces `target_time = issued_at + lead_hour` exactly.
- Compose includes an application healthcheck. Detailed audit evidence and gaps are in `docs/backend-spec-audit.md`.

## Validation

- PASS on the audit branch and before latest-main merge: core (32), foundation (4), agent (12), replay (1), weather (25), forecast (7), acceptance harness (2), lint, typecheck, and production build.
- PASS before latest-main merge: Compose config/build/startup and application/database healthchecks; `/api/health` returned `database=ready`.
- PASS before latest-main merge: disposable PostgreSQL 16 migrations; CSV import produced three canonical observations and a persisted 24-point forecast; a separate clean database passed agent claim/fencing/checkpoint/restart integration.
- PASS after incorporating `cee93a6`: core (32), foundation (4), agent (12), replay (1), weather (25), forecast (7), acceptance harness (2), lint, typecheck, and production build.
- PASS after incorporating UI-prototype `b7fee06`: core (32), lint, typecheck, and hermetic Docker production build. A local build retry encountered a concurrently damaged `node_modules`; `npm ci` restored lint/typecheck and the clean container build passed.
- FAIL (pre-existing, unrelated): UI localization suite reports missing English/Kazakh translation for Russian `Проверяем…`; the audit does not change frontend/i18n.
- EXPECTED BLOCKED: `node tests/acceptance/run.mjs verify` reports missing `demo:verify`; the fail-closed harness itself passes.
- BLOCKED by inputs/provenance: no February actuals, no provider-proven historical publication time, and unconfirmed turbine/time/power semantics.
- SKIP unless explicitly configured: live OpenAI smoke (`RUN_OPENAI_SMOKE=1` plus a verified model/key).

## Decisions and constraints

- Official specification v1.1 SHA-256: `6785661fbe95c0ee385b6740ca42cc6b2748e208c2802e9f34e7cfc9a6fb3974`.
- No actual/reanalysis weather may substitute for unavailable historical forecasts.
- Unknown publication time is not inferred from model run time; eligibility requires a recorded assumption.
- Only `data_use=training` is bridged into canonical observations.
- Only the persistence model currently has production inference support; unsupported artifacts fail explicitly.
- Candidate turbine coordinates from the PDF remain unconfirmed configuration.
- Development `test` credentials remain local-only and are not committed.

## UI/UX prototype

- Added 2026-09-23 11:25Z: `docs/design/terra-redesign.html` — standalone static HTML proposal for the dashboard (overview, forecast, sources, run log) with a demo/real data toggle. Synthetic data only; not wired into `src/` and not part of the build.
- Implemented the prototype's overview hierarchy in the live `/overview` route: forecast heading, four derived KPI cards, current/previous forecast chart, data-quality alerts, source actions, and a real-data onboarding state.
- Preserved canonical normalized units: the UI does not invent MW/MWh while the asset nominal capacity is unconfirmed.
- Touched paths: `src/components/dashboard/overview.tsx`, `src/app/globals.css`.

## Overview validation

- PASS: `npm run typecheck`.
- PASS: `npm run build` (Next.js 16.3.6 production build, all 19 static pages generated).
- SKIPPED by explicit task instruction: automated test suites.
- PASS: `git diff --check`.

## Next actions

1. Retry task-branch and integration-HEAD pushes when `origin` access is restored; push integration HEAD to `main` and verify `e9dfb21` ancestry on `origin/main`.
2. Fast-forward the checked-out local `main` only after remote synchronization can be verified.
3. After owner data is available, confirm asset/time/power semantics and the historical weather availability policy.
