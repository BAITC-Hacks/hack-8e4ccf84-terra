# Project state — historical forecast viewer on local main

- Updated UTC: 2026-09-23T11:59:42.650Z
- Branch/worktree: local main / primary working tree, explicitly requested by the user. No worktree or push for this task.
- Base/integration: last verified base 49eaa72; historical-viewer changes uncommitted pending the local feature commit. Concurrent connector, client and translation changes are preserved.
- Owner/status: Codex; historical viewer implemented and validated locally, prepared for the requested commit. Remote synchronization is outside this task by explicit instruction.

## Historical viewer (current task)

- Acceptance: default protected landing page and first navigation item is /history; turbine selection, inclusive issue-date range within 2026-01-31–2026-02-28 UTC, exact 24/48-hour horizon, sequential daily navigation, graph/table, explicit missing and incomplete releases.
- Demo: two synthetic turbines, 29 daily issues, no invented actuals; target hours after February remain visible and are not claimed as February evaluation.
- Real reads: canonical assets/forecasts envelopes, turbine-only selection, persisted backtest/replay releases; warns at the server's 100-release limit. Errors retain same-query data and never fall back to fixtures.
- Scope: saved-release viewer only. Selecting a day does not execute training or forecasts; automatic whole-period execution is explicitly marked unavailable.
- Touched: history routes/components/data adapter, dashboard navigation/client/chart, i18n, auth return allowlist/proxy matcher, CSS, README, UI tests.
- PASS: npm test (42 tests); node --test tests/ui/platform.test.cjs tests/ui/client.test.cjs tests/ui/csv.test.mjs (12 tests); npm run typecheck; npm run build (21 static pages, /history present).
- PASS: npm run lint -- --ignore-pattern .worktrees/**. Bare npm run lint traversed unrelated nested worktrees and was interrupted; the scoped command checks this repository's application and tests.
- PASS: node tests/ui/history.cjs with runner Playwright — real login/default route, daily navigation, turbine/horizon/range changes, gaps/errors, RU/EN/KK, mobile overflow, dark mode, canonical API mocks and failed-refresh retention. Production server used ephemeral credentials and was stopped afterward.
- PASS: visual review of desktop/mobile screenshots under ignored .next/ui-qa; git diff --check. Database-backed historical E2E was not run; browser data API responses are mocks.
- Environment: missing dependencies were restored with npm install without changing manifests/lockfile; npm ci initially hit a locked native module on Windows.

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

1. Review /history locally with the user; do not push (user instruction).
2. Next UX slice: connect the historical viewer to durable full-period execution and visible agent stages, using verified archival inputs.
3. Existing backend work: confirm asset/time/power semantics, persist trustworthy archival weather, connect an approved trained artifact, and obtain February actuals before official evaluation.

## Parallel completion specification

- Updated UTC: 2026-09-23T12:02:06.8364423Z; integration branch chore/integrate-parallel-agent-spec; verified task commit 8181841, base 66421cf; canonical handoff prepared for local main.
- Scope: docs/parallel-agent-completion-spec.md defines six parallel ownership-scoped tasks, fixed integration contracts, P7 E2E acceptance, and serialized delivery to local main through private integration worktrees.
- PASS: seven task sections and existing repository references checked; git diff --check. Application tests/build not run: documentation-only change.
- Remote fetch BLOCKED: Repository not found. User requests local main delivery; no remote completion claimed.
- Next: dispatch P1-P6 when requested; run P7 after their integration. Preserve historical-viewer state above.

## P1 canonical weather ingestion — task branch

- Updated UTC: 2026-09-23T12:11:00Z; branch feat/p1-weather-ingestion; verified base 1923ce2, implementation uncommitted. Owner: P1/Codex. Local integration pending; other parallel tasks remain independent.
- Implemented: archived Single Runs fetch with bounded retry, raw/hash plus canonical weather rows in one transaction, immutable/idempotent repeats, strict validation, UTC range CLI with per-asset/issue coverage. Paths: weather connector, scripts/weather-ingest.ts, tests/weather, docs/handoffs/parallel-P1.md.
- PASS: weather 25/25; P1 PostgreSQL 16 integration 3/3 (atomic visibility/rollback, concurrent duplicate prevention, consumer gates, two-issue CLI rerun); npm test 44 passed / 1 DB skip (DB tested separately); agent 12/12; foundation 4/4; lint, typecheck and production build. Final post-review lint/typecheck/build rerun PASS.
- Constraint: unknown historical published_at/available_at stay NULL; research assumptions remain isolated metadata. Archived ingestion works, official historical consumption is BLOCKED. Consumer success test supplies clearly test-only publication evidence; no actual publication timestamps fabricated in production.
- Remote fetch BLOCKED: Repository not found. Next: finish final checks, commit P1, integrate through private worktree/shared lock into local main, retry remote delivery. No combined P7 E2E claimed.
- P1 contract review: CLI explicitly requires timeZone=UTC (IANA), with no local-calendar inference; PostgreSQL CLI 3/3, typecheck and production build PASS for this final refinement.
