# Project state — Russian README integration

- Updated UTC: 2026-09-23 11:42Z
- Branch/worktree: `chore/integrate-russian-readme` / `.worktrees/integrate-russian-readme`
- Base/integration: latest local `main` and last-known `origin/main` at `4ed268c`; README task commit `75119a5` is merged in the current integration worktree.
- Owner/status: Codex; conflict reconciled without dropping the backend audit handoff, integration checks pass, merge commit pending.

## Integrated implementation

- The root README is now a detailed Russian project guide covering the task, verified status, architecture, Docker/local setup, UI, API flow, data contract, agent/replay/model behavior, tests, environment, repository layout, and limitations.
- Protected Next.js dashboard exposes overview, forecast, sources, and agent journal pages with explicit synthetic fixture and real-API modes.
- PostgreSQL migrations, confirmed CSV ingestion, canonical observations, persistence forecasts, durable agent jobs, and replay runtime are integrated.
- CSV training rows are mirrored transactionally into canonical `observations`; evaluation-only targets remain isolated.
- Forecast publication requires `normalized`, weather eligibility is bounded by recorded availability, and backtest enforces `target_time = issued_at + lead_hour`.
- Open-Meteo evidence does not yet populate canonical production weather tables; official February scoring remains blocked by missing actuals and trusted historical publication times.

## Validation

- PASS on README task branch: all relative README links resolve; `git diff --check` is clean.
- PASS on README task branch: core 32/32, foundation 4/4, agent 12/12, replay 1/1, weather 25/25, acceptance harness 2/2.
- PASS on README task branch: lint, typecheck, and production build.
- PASS after merging into latest local `main`: core 32/32, lint, typecheck, and production build.
- PASS from prior backend integration: disposable PostgreSQL migrations/import/forecast and agent fencing/restart integration; Compose config/build/startup and healthchecks.
- EXPECTED BLOCKED: `node tests/acceptance/run.mjs verify` has no integrated `demo:verify` script.
- BLOCKED by inputs/provenance: no February actuals, no provider-proven historical publication time, and unconfirmed turbine/time/power semantics.
- BLOCKED remote sync: fetch/push from this environment returns `Repository not found` for the configured GitHub remote.
- SKIP unless explicitly configured: live OpenAI smoke.

## Decisions and constraints

- Documentation separates synthetic fixtures, implemented backend behavior, and unavailable official evidence.
- No actual/reanalysis weather substitutes for unavailable historical forecasts.
- README does not claim MW/MWh output, February metrics, trusted archival weather availability, or production ridge inference.
- The standalone dispatcher and current real-API dashboard contract mismatch are documented as limitations.
- The UI redesign HTML remains a standalone synthetic proposal, not part of the application build.

## Next actions

1. Commit the reconciled canonical state.
2. When repository access is restored, push the task branch and integration HEAD to `origin/main` without rewriting history; verify `75119a5` ancestry.
3. After owner data is available, confirm semantics, persist trustworthy archival weather runs, connect an approved trained artifact, and execute February replay/evaluation.
