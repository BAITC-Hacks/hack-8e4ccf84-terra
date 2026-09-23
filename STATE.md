# Local UI cleanup integration

- Updated UTC: 2026-09-23T12:39:16.998Z; branch chore/integrate-content-local; base local main 5115dd0; task 0923d95.
- User requested local main only. Merged concise RU/EN/KK content and disclosures; retained current KPI, typography and backend work.
- Task passed build, lint, typecheck, 14 browser workflows, history and 30 responsive/language/theme combinations. Integration checks pending.
- Next: validate merged tree and fast-forward local main; no remote publication requested.

## Preserved main handoff

# Project state — P1 and P4 local integration

- Updated UTC: 2026-09-23T12:26:00Z
- Branch/worktree: chore/integrate-p1-weather / private integration worktree under the shared lock; delivery target local main.
- Base/integration: verified local main be3f5a3 includes historical viewer 66421cf and P4 1c8901a; this integration tree also includes P1 69982e9. Canonical handoff reconciled; this integration commit delivers P1 while preserving P4.
- Owner/status: P1/Codex; P1 task validated and P4 preserved. P2/P3/P5/P6 branches remain active; their completion is UNKNOWN here. Remote fetch/push BLOCKED: Repository not found.

## Historical viewer (prior integrated task)

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
- P1 CLI now persists complete validated Open-Meteo archives in canonical tables atomically. Unknown publication/availability stay NULL, so official February consumption remains blocked by provenance; missing actuals independently block scoring.

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

1. Continue independently owned P2/P3/P5/P6 work; preserve integrated history and P4.
2. Next UX slice: connect the historical viewer to durable full-period execution and visible agent stages, using verified archival inputs.
3. Existing backend work: confirm asset/time/power semantics, persist trustworthy archival weather, connect an approved trained artifact, and obtain February actuals before official evaluation.

## Parallel completion specification

- Updated UTC: 2026-09-23T12:02:06.8364423Z; integration branch chore/integrate-parallel-agent-spec; verified task commit 8181841, base 66421cf; canonical handoff prepared for local main.
- Scope: docs/parallel-agent-completion-spec.md defines six parallel ownership-scoped tasks, fixed integration contracts, P7 E2E acceptance, and serialized delivery to local main through private integration worktrees.
- PASS: seven task sections and existing repository references checked; git diff --check. Application tests/build not run: documentation-only change.
- Remote fetch BLOCKED: Repository not found. User requests local main delivery; no remote completion claimed.
- Next: finish active parallel branches and run P7 after integration. Preserve historical-viewer state above.

## P1 canonical weather ingestion

- Updated UTC: 2026-09-23T12:26:00Z; task feat/p1-weather-ingestion at 69982e9 (implementation df8d383); merged with main be3f5a3 including P4. Owner: P1/Codex. Validated local integration; further repeated checks explicitly waived by the user.
- Implemented: archived Single Runs fetch with bounded retry, raw/hash plus canonical weather rows in one transaction, immutable/idempotent repeats, strict validation, UTC range CLI with per-asset/issue coverage. Paths: weather connector, scripts/weather-ingest.ts, tests/weather, docs/handoffs/parallel-P1.md.
- PASS: weather 25/25; P1 PostgreSQL 16 integration 3/3 (atomic visibility/rollback, concurrent duplicate prevention, consumer gates, two-issue CLI rerun); npm test 44 passed / 1 DB skip (DB tested separately); agent 12/12; foundation 4/4; lint, typecheck and production build. Final post-review lint/typecheck/build rerun PASS.
- Constraint: unknown historical published_at/available_at stay NULL; research assumptions remain isolated metadata. Archived ingestion works, official historical consumption is BLOCKED. Consumer success test supplies clearly test-only publication evidence; no actual publication timestamps fabricated in production.
- Remote fetch/task push BLOCKED: Repository not found. Next: obtain confirmed weather publication/asset semantics; continue P2/P3/P5/P6 and P7; retry remote delivery when access returns. No combined P7 E2E claimed.
- P1 contract review: CLI explicitly requires timeZone=UTC (IANA), with no local-calendar inference; PostgreSQL CLI 3/3, typecheck and production build PASS for this final refinement.

## P4 batch replay — locally validated integration

- Updated UTC: 2026-09-23T12:24:54.6985223Z; owner P4/Codex; integration branch chore/integrate-p4-february.
- Verified task commit: 1c8901a; integration base: 1923ce2a6b9fbf6f89c8f4397d5e9a72f9a27f1e. Canonical state prepared for local main; this merge commit records the integration.
- Implemented: 116 sequential default releases, explicit timezone/hour, whole-range preflight, durable existing agent jobs, deterministic resume, bounded polling/cancel, canonical provenance export and February target mask. See docs/handoffs/parallel-P4.md for exact commands and limitations.
- PASS in task: 51 tests, agent 12, replay 1, lint, typecheck, production build (21 pages), CLI help, diff/secret review. PASS repeated in integration: npm test, test:agent, test:agent:replay, typecheck and production build; no shared implementation files changed by P4.
- Scope: only P4 new batch/CLI/tests/handoff paths plus this integration state entry. Other task statuses remain as recorded above; P4 makes no new completion claims for other tasks.
- BLOCKED remote fetch/push: Repository not found. No origin/main claim. Real PostgreSQL replay and official February qualification remain P7 work; missing actuals and historical provenance are not replaced by fixtures.
- Next: fast-forward local main to this verified integration, verify task ancestry; P7 runs documented CLI after P1/P2/P6 wiring and inputs are available. Retry remote synchronization when repository access is restored.

- P1 final integration evidence: combined npm test PASS (53 passed, 1 DB skip; P1 PostgreSQL 3/3 separately), typecheck PASS; production build compiled/typechecked and generated pages. User explicitly requests immediate main delivery without more tests. Separate live archived weather smoke PASS (120 hours, publication still UNKNOWN).

## Parallel P2 — approved trained inference

- Updated UTC: 2026-09-23T12:28:21.7723618Z; owner P2/Codex; integration branch chore/integrate-p2-trained. Last verified task commit: c1ba6aa2b915c31934c484c52bc8cf5bbf4424c0; integration base: e285f93ec0a49208ee854047109861face3879fa.
- Validated code on this lineage: predictApprovedModel returns canonical normalized 24/48-hour values; strict artifact/schema/checksum/version/approval and forecast-feature gates; reproducible training CLI with pre-February temporal folds and paired persistence comparison.
- P2 owned paths: src/server/ml, tests/ml, scripts/train-approved.ts, docs/handoffs/parallel-P2.md. Agent/forecast wiring remains P6; preserve other active P1/P3/P4/P5/P6 tasks and their handoffs.
- PASS task: 51 tests, 15 ML tests, typecheck, lint, canonical production build (21 pages), diff/secret review. Repeated integration tests/build/lint/typecheck SKIPPED by explicit user instruction to deliver to main immediately; task checks above already passed. Integration diff reviewed.
- Synthetic measured validation only: N=144, power_curve:3m MAE approximately 7.52e-17 versus persistence MAE 0.34; synthetic artifact remains candidate. This is not evidence of real historical skill or P7 E2E.
- BLOCKED historical approval: canonical archived pre-February training forecast snapshots and confirmed data semantics are absent. CSV weather is observed; February actuals remain evaluation-only and unavailable. P6 must preserve temperature and feature height in both snapshot paths and load trusted approved artifacts.
- BLOCKED remote fetch/push: Repository not found. Local main delivery uses serialized lock and fast-forward; no origin/main claim.
- Next: P6 connects trained inference in both runtime paths; obtain archived training inputs and run node node_modules/tsx/dist/cli.mjs scripts/train-approved.ts --input manifest.json; P7 performs combined acceptance after all parallel tasks.

## P5 evaluation — local integration

- Updated UTC: 2026-09-23T12:29:06.4028948Z; owner P5/Codex; branch chore/integrate-p5-evaluation; verified task commit 223df62; integration base b82ddbfd6eeb6bab7ec609f05585f33f391ee9ca.
- Implemented isolated immutable actual revisions, versioned persisted EvaluationReport, explicit February calendar, normalized MAE/RMSE/N/coverage and common-pair baseline, semantic manifest and worker/CLI. See docs/handoffs/parallel-P5.md.
- PASS on task branch: npm test (49/49 including disposable PostgreSQL); final P5 suite (7/7); lint; typecheck; production build (21 pages); diff/secret review. Initial dependency-related checks recovered after independent npm ci.
- Integration tests intentionally NOT REPEATED per user's latest instruction to deliver immediately to main. Merge only overlaps STATE.md; all existing P1/P2/P4 handoffs and code are preserved.
- BLOCKED remote fetch/push: Repository not found. No origin/main claim. Real February actuals and unconfirmed source semantics remain external blockers; P6 worker wiring and P7 E2E remain separate.
- Next: P6 can call evaluatePublishedForecasts after migration and actual ingestion; obtain confirmed actuals/semantics for official metrics; retry remote sync when available.


## P3 — durable input triggers, local integration

- Updated UTC: 2026-09-23T12:29:50.945Z; owner Codex; integration branch chore/integrate-p3-input-triggers. Verified task commit c07e170; integration base 6ea303d.
- Implemented: canonical weather/measurement discovery, explicit timezone release schedule, PostgreSQL event/snapshot ledger, idempotent existing agent-job enqueue, restart/cancel/DB-failure recovery, standalone CLI. Handoff: docs/handoffs/parallel-P3.md.
- PASS on task commit: trigger/PostgreSQL/CLI tests 12/12; npm test 44 passed (DB case run separately); agent 12/12; replay 1/1; forecast 7/7; typecheck, lint, production build and diff review.
- Integration checks intentionally not repeated: user explicitly requested immediate main delivery without repeated tests. Existing integrated tasks and their handoffs are preserved.
- P6 integration pending: require readTriggerSnapshot(sql,eventKey) for input-trigger jobs so runtime pins observation revisions/weather values; add Compose worker wiring. Current P3 publication evidence uses a test-only adapter, not production fallback. P7 E2E remains pending.
- Remote synchronization BLOCKED: fetch and task-branch push return Repository not found. Local main delivery does not claim origin/main.
- Next: P6 connects snapshot inputs and deployment; P7 runs combined E2E; restore remote access and synchronize without rewriting history.
