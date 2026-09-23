# P6 — runtime wiring and canonical dashboard adapters

- Owner: Codex. Branch: `feat/p6-runtime-wiring`; base local main `1923ce2`.
- Status: **integration pending**, not complete. P2/P3/P5 have no integrated production modules in this branch yet. No overall February E2E claim.
- Scope: agent/forecast modules, dashboard client, Compose, `tests/runtime-wiring`; history UI, shared contracts, package scripts, migrations and other task paths are unchanged.

## Implemented boundary

- `ForecastInference` uses the exact persistence result type. `ForecastService`, `forecastRuntime`, `PostgresAgentPorts` and `createRuntime` accept the same async predictor. Approved registry selection is checked before inference. The default remains explicitly persistence-only; trained requests fail rather than falling back. Contract doubles exist only in tests.
- The trained synchronous snapshot retains all features of the selected eligible run from the same reader call, hashes them, and freezes the result. Agent snapshots preserve temperature and height; forecast quality flags are carried from inference instead of labelling all outputs persistence. Per-job config version is preserved.
- `TriggerSnapshotReader` provides a fail-closed P3 seam. Trigger event keys must match request mode/assets/model/config/hour/horizon and persisted digest. Weather and observation revisions come from the pinned snapshot, with deterministic gates reapplied. PostgreSQL JSONB key order is not treated as a new snapshot digest.
- Dashboard reads canonical forecast/evaluation/job/agent envelopes. Forecast model ID/mode, null gaps and missing-input reasons remain visible; evaluation N=0 has null metrics and a reason. Launch uses existing durable `/agent-runs` for all three modes; job status and journal pagination use its real contracts. API failure never selects synthetic fixtures. Existing history adapter behavior is preserved.
- Compose has a one-shot migration service; app waits for migrations and healthy DB; the existing dispatcher script runs once as a service after app health. Environment supplies secrets/optional LLM settings; restart/init/graceful stop configured. No second dispatcher implementation or queue.

## Dependency work remaining

1. Once P2 is integrated, load the model's trusted `raw_artifacts` reference, verify raw SHA-256 plus registry version/codeVersion against the parsed deployment artifact, then call `predictApprovedModel` from both default production paths. Reject candidates/corrupt/mismatched artifacts. Test real P2 inference on a clearly marked controlled fixture; do not approve real models without historical evidence.
2. Once P3 is integrated, inject `readTriggerSnapshot(sql,eventKey)` and add its worker to Compose using explicit config-file/calendar settings. Current inspected P3 draft snapshots retain only wind; P2 also requires temperature and heights. Do not pretend that this draft already supports trained trigger jobs.
3. Once P5 is integrated, deploy a polling wrapper over its idempotent `evaluatePublishedForecasts` function with explicit canonical forecast IDs/calendar/semantic manifest. Connect saved evaluation retrieval through the existing API boundary with its owner; the current endpoint reads the legacy in-memory registry. Do not synthesize metrics on unavailable actuals.
4. Re-run Compose build/startup, PostgreSQL runtime tests and both trained paths after integration. P7 owns complete historical E2E. Real archival evidence, confirmed semantics and February actuals remain external blockers.

## Validation

- PASS before the user's stop-tests instruction: `npm test` 49/49; existing forecast/agent/reliability/replay/UI client suites 24/24; targeted runtime wiring 7/7 (PostgreSQL opt-in case skipped).
- PASS: lint and typecheck on the earlier boundary; final lint and typecheck passed. The initial test typing failure was corrected.
- PASS: `docker compose -p terra-p6-check config --quiet` with ephemeral environment secrets.
- PASS: canonical `npm run build` after physical task-local `npm ci`; 21 pages including history. Initial junction/Turbopack error was resolved without changing package manifests.
- Docker rebuild passed its internal Next.js compile/typecheck/static generation; image export still in progress. Initial Docker context had the now-corrected test typing error. No failing image was deployed.
- SKIP by explicit user instruction “не прогоняй тесты”: further test runs, PostgreSQL opt-in test and Compose smoke. Existing results above predate that instruction. Integration will use diff review/build checks without rerunning tests.
- Remote fetch BLOCKED: configured GitHub origin returns `Repository not found`.

## Next action

Finish verification, commit the independently buildable P6 boundary, integrate sequentially through the repository lock and a private integration worktree, and refresh this handoff with exact results and task/main SHAs. Preserve integration-pending status until all dependency work above is actually validated.
