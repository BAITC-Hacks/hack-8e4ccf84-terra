# P5 — Published forecast evaluation

- Updated UTC: 2026-09-23T12:14:06.7843660Z
- Owner: P5 / Codex. Branch: feat/p5-forecast-evaluation. Base: 1923ce2; verified task commit 223df62; integrated through chore/integrate-p5-evaluation.
- Scope: isolated revisioned actuals, persisted versioned EvaluationReport, explicit February calendar, normalized source scale, worker/CLI, semantic manifest. No agent/forecast/UI changes.
- Entry points: importEvaluationActuals(sql, bundle) in src/server/evaluation/actuals.ts; evaluatePublishedForecasts(sql, request) in src/server/evaluation/worker.ts. Request: forecastRunIds, calendarTimezone, manifest. Return: {report, version, reused}.
- CLI: node --import tsx scripts/evaluate-forecasts.ts request.json [actuals.json]; DATABASE_URL required. Apply normal migrations first (0105_p5_evaluation.sql).
- Selection: homogeneous mode/model/horizon; latest requested version per asset/issue, all distinct issue/lead pairs retained. Coverage measures pairs within February, not every calendar hour. Exact manifest hash required for compatible actuals.
- Corrections: insert-only immutable actual revisions; null retracts. Unchanged inputs reuse report ID, corrected inputs create another evaluation version. Original forecasts, model and snapshots remain unchanged.
- Baseline: frozen accepted normalized observations, available by issue and strictly before selected February boundary. No target-derived baseline/features/model selection.
- PASS: unit/reference metrics, N=0, gaps, duplicate policy, calendar boundaries, leakage guard; disposable PostgreSQL migrations, populated-schema upgrade, concurrency/idempotency, rollback, corrections, unchanged forecasts/snapshots/models and empty training tables.
- PASS: npm test (49/49 including PostgreSQL with explicit P5_TEST_DATABASE_URL); npm run lint; npm run typecheck; staged diff/secret-pattern review.
- PASS final: npm run build (21 pages); npm run typecheck; npm run lint; node --import tsx --test tests/evaluation/*.test.ts (7/7 including disposable PostgreSQL and simultaneous first report creation). Initial junction build and a typecheck during installation failed on incomplete/external dependencies; both passed after npm ci in this worktree, without manifest/lockfile changes.
- BLOCKED: real February actuals and confirmed source semantics unavailable. Tests are synthetic fixtures only. Remote fetch: Repository not found.
- P6 integration pending: call worker periodically after actual ingestion with explicit canonical publication IDs and semantic manifest; reuse same request for revisions. No second queue or scheduler created.
- Integration: latest local main preserved under shared lock; STATE.md reconciled with P1/P2/P4. Integration checks not repeated per explicit user request for immediate main delivery. Next: P6 wiring, P7 E2E, confirmed inputs; remote synchronization remains blocked.
