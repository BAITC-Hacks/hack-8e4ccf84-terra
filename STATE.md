# Project state — README on local main

- Updated UTC: 2026-09-23 11:49Z
- Branch/worktree: local `main` / primary working tree; canonical state prepared from `chore/integrate-russian-readme`.
- Base/integration: local `main` fast-forwarded to `649e379`; README task `75119a5` and overview task `e9dfb21` are verified ancestors.
- Owner/status: Codex; detailed Russian README is validated and present on local `main`. Remote synchronization remains blocked.

## Integrated implementation

- Root `README.md` is now a detailed Russian guide covering the task, verified status, architecture, Docker/local setup, UI, API flow, data contract, agent/replay/model behavior, tests, environment, layout, and limitations.
- The live `/overview` implements the approved prototype hierarchy: forecast heading, derived KPI cards, current/previous chart, data-quality alerts, source actions, and real-data onboarding.
- Protected dashboard exposes overview, forecast, sources, and agent journal pages with explicit synthetic fixture and real-API modes.
- PostgreSQL migrations, confirmed CSV ingestion, canonical observations, persistence forecasts, durable agent jobs, and replay runtime are integrated.
- CSV training rows are mirrored transactionally into canonical `observations`; evaluation-only targets remain isolated.
- Forecast publication requires `normalized`, weather eligibility is bounded by recorded availability, and backtest enforces `target_time = issued_at + lead_hour`.
- Open-Meteo evidence does not yet populate canonical production weather tables; official February scoring remains blocked by missing actuals and trusted historical publication times.

## Validation

- PASS on README task branch: relative README links, `git diff --check`, core 32/32, foundation 4/4, agent 12/12, replay 1/1, weather 25/25, acceptance harness 2/2, lint, typecheck, and production build.
- PASS on overview task integration: typecheck, production build, and `git diff --check`; automated suites were skipped by that task's explicit instruction.
- PASS from prior backend integration: disposable PostgreSQL migrations/import/forecast, agent fencing/restart integration, Compose config/build/startup, and healthchecks.
- PASS after merging `ab2622c`: core 32/32, lint, typecheck, production build, and `git diff --check`.
- EXPECTED BLOCKED: `node tests/acceptance/run.mjs verify` has no integrated `demo:verify` script.
- BLOCKED by inputs/provenance: no February actuals, no provider-proven historical publication time, and unconfirmed turbine/time/power semantics.
- BLOCKED remote sync: fetch/push from this environment returns `Repository not found` for the configured GitHub remote.
- SKIP unless explicitly configured: live OpenAI smoke.

## Decisions and constraints

- Documentation separates synthetic fixtures, implemented backend behavior, and unavailable official evidence.
- No actual/reanalysis weather substitutes for unavailable historical forecasts.
- Unknown weather publication time requires a recorded availability assumption.
- README and overview do not claim MW/MWh output, February metrics, trusted archival availability, or production ridge inference.
- The standalone dispatcher and current real-API dashboard contract mismatch are documented limitations.
- The design HTML remains a synthetic proposal; its overview hierarchy is now implemented in the live route.

## Next actions

1. Preserve the unrelated uncommitted history-page work currently present in the primary worktree.
2. When repository access is restored, push the README task branch and local `main`, then verify `75119a5` and `e9dfb21` ancestry on `origin/main`.
3. After owner data is available, confirm semantics, persist trustworthy archival weather runs, connect an approved trained artifact, and execute February replay/evaluation.
