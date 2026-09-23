# P3 — automatic input triggers

Owner: Codex. Branch: `feat/p3-input-triggers`. Base: local `main` at `1923ce2`.
Updated: 2026-09-23 UTC. P3 implemented and validated on the task branch; local main integration pending.

## Delivered boundary

- `src/server/triggers/`: explicit calendar configuration, canonical input discovery, PostgreSQL event ledger and standalone polling worker. Existing `PostgresJobStore.enqueue` is the only execution enqueue path.
- `0103_p3_input_events.sql`: additive migration; ledger persists the unchanged `JobPayload` and existing `ForecastInputSnapshot` before enqueue. A crash after enqueue but before acknowledgement retries the identical key/payload. Unique canonical jobs prevent duplicates, including cancelled jobs.
- One asset per job because the existing payload pins one weather run. Event identity includes asset, issuedAt, horizon, mode, model ID, config version and complete input snapshot hash. Live/replay/backtest identities and dispatch are isolated.
- Reconcile every scheduled issue between explicit `startAt` and `min(now,endAt)` on every scan. No ingested-time high-water cursor: late commits and late historical imports cannot fall behind one. Configure a bounded range for large deployments; scan cost grows with the issue range and eligible input versions.
- Each complete eligible weather run is combined with the latest revision at the latest eligible measurement event time. Superseded measurements/revisions are irrelevant under the current input contract; intermediate corrections superseded before polling are coalesced. Already discovered versions remain durable. Unknown publication, future availability, wrong units, missing hours and ambiguous wind heights do not enqueue. Only canonical observations are queried; evaluation-only storage is never read.
- Inputs are selected as of issuedAt, never polling time. New data available after an old release may only affect a later scheduled release. A historically admissible late import may recalculate the original release. DST repeated wall hours map to distinct UTC releases; nonexistent wall hours are skipped. Non-whole-hour UTC calendars fail explicitly because the shared forecast contract requires whole UTC hours.
- SIGINT/SIGTERM stop discovery/dispatch and interrupt polling sleep. Committed ledger records survive cancellation; existing jobs are not cancelled by stopping a worker. Canonical job cancellation remains terminal for the same event.

## P6 integration — required before production activation

1. Run migration before the worker. Compose/deployment changes belong to P6.
2. Exported `readTriggerSnapshot(sql, eventKey)` returns the persisted `ForecastInputSnapshot` or null. For `input-trigger:v1:` jobs, runtime must require this snapshot and use its pinned observation revisions (and weather values), rather than reselecting latest measurements at execution time. Keep deterministic gates. The unchanged payload already pins `weatherRunId`.
3. The current production adapter otherwise reads latest measurements. P3 does not edit it. A **test-only adapter** exercises pinned observations through the existing real runner and canonical publication store. This is contract evidence, not a claim that production P6 wiring or P7 E2E is finished.

## Direct execution

Set `DATABASE_URL` through the environment, then:

```sh
node node_modules/tsx/dist/cli.mjs scripts/input-trigger-worker.ts /path/to/config.json
# A single bounded pass (useful for smoke tests):
node node_modules/tsx/dist/cli.mjs scripts/input-trigger-worker.ts /path/to/config.json --once
```

Example configuration (replace IDs with real catalog IDs; no implicit defaults for calendar/mode):

```json
{
  "assetIds": ["11111111-1111-4111-8111-111111111111"],
  "modelVersionId": "22222222-2222-4222-8222-222222222222",
  "configVersion": "agent-v1",
  "mode": "live",
  "timezone": "Asia/Qyzylorda",
  "issueHours": [5],
  "startAt": "2026-01-31T00:00:00.000Z",
  "endAt": "2026-02-28T00:00:00.000Z",
  "horizons": [24, 48],
  "pollMs": 30000,
  "dispatchBatch": 100,
  "maxAttempts": 3
}
```

Omit endAt for ongoing scheduling. Hourly releases use all 24 issueHours. Pending discoveries drain in dispatchBatch groups; they are not silently discarded when inputs change. Preserve the ledger and jobs together; manually deleting canonical jobs breaks their durable idempotency contract.

## Validation and next actions

- PASS: `TEST_DATABASE_URL=<local disposable p3_test> node node_modules/tsx/dist/cli.mjs --test tests/triggers/*.test.ts` — 12/12, including all migrations, two concurrent workers, crash boundaries, terminal cancellation, source updates, real PostgreSQL connection termination/reconnect, uncommitted weather visibility, CLI cold start/restart, canonical publication through the test adapter. Synthetic inputs are explicitly marked; no official February result is claimed.
- PASS: `npm test` — 44 passed, database test skipped without its explicit URL (run separately above); `npm run test:agent` — 12/12; `npm run test:agent:replay` — 1/1; `node --test tests/forecast/service.test.cjs` — 7/7.
- Fixed during validation: cold-start text-array parameter typing in dispatch; switched to explicit JSONB containment. Runner test now waits through transient retry backoff before asserting terminal publication.
- PASS: `npm run typecheck`, `npm run lint`, `npm run build` (21 generated pages), `git diff --check`, staged diff review and scoped secret-pattern review (no matches).
- Resolved build environment issue: Turbopack rejected an external node_modules junction. Replaced only this task's junction with local dependencies (`npm ci --ignore-scripts`). Checks attempted during installation lacked local executables and are not counted as passes; final checks above passed with the completed installation.
- Remote fetch BLOCKED: configured GitHub repository returns `Repository not found`. No remote completion claimed.
- Next: serialize local main integration under the shared lock and update canonical STATE.md. P6 must connect pinned snapshots and deployment; P7 validates overall E2E. Official February weather/actuals provenance remains outside P3.
