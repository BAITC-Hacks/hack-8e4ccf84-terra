# P4 — Reproducible February batch replay

Owner: P4 / Codex. Branch: `feat/p4-february-replay`. Base: local main `1923ce2`.
Status: implementation and adapter tests verified; production PostgreSQL run belongs to P7.

## Delivered boundary

- `src/server/replay/batch/index.ts`: dependency-injected batch orchestrator, explicit IANA calendar,
  whole-hour UTC issues, 29 inclusive default days, two assets × 24/48 = 116 sequential releases.
- `postgres.ts`: existing PostgresAgentPorts for as-of input preflight, PostgresJobStore for durable
  agent jobs in replay/backtest mode, PostgresForecastStore for canonical results. No private ML
  calls, new queue, database format, migrations or production synthetic fallback.
- `scripts/replay-february.ts`: validated CLI, deterministic batch/resume ID, atomic JSON manifests,
  exclusive per-manifest directory lock, bounded database statements and polling, SIGINT/SIGTERM.
- `tests/replay-batch`: nine behavior tests, including a synthetic adapter isolated to tests.

## Run

Start the existing application and job dispatcher against the same migrated database first.
Set DATABASE_URL in the environment; credentials must not be command-line arguments.

```sh
node --import tsx scripts/replay-february.ts --assets <uuid1>,<uuid2> --model <approved-model-uuid> --timezone Asia/Almaty --issue-hour 0 --mode replay --from 2026-01-31 --to 2026-02-28 --output <artifact-directory>
```

`--config-version` defaults to agent-v1. `--max-polls` defaults to 300 and `--poll-ms` to 1000;
accepted bounds are 1–3600 polls and 0–60000 ms. Live mode is forbidden.
Timezone/hour/mode/assets/model must be explicit. Quarter/half-hour timezone offsets that cannot
produce a canonical whole UTC hour, missing DST hours and ambiguous DST hours are rejected.
The date range is a LOCAL issue-date calendar; Asia/Almaty midnight on January 31 is January 30
19:00 UTC. Export/evaluation calendar is the same explicitly selected timezone.

Repeat exactly the same command to resume, optionally adding `--resume-id <printed-sha256>`.
Config mismatch fails. Existing completed releases are skipped. The event key also contains input
versions and mode, so a crash between enqueue and manifest write recovers the same durable job.
Timeout stops submission of subsequent releases; resume polls that same job without cancelling it.
Terminal job failures/cancellations and missing preflight inputs remain recorded and are not retried
silently. To re-preflight after filling missing inputs, use a new output directory; identical successful
release keys still reuse existing durable jobs. For a terminal job requiring a new attempt after a
code/config fix, use an explicitly changed config version. Saved preflight selections never mutate.

The entire range is preflighted before enqueue: approved model/cutoff, eligible historical weather
with full wind coverage, and normalized non-evaluation observations. Unknown trained-model cutoff,
future training data, explicit weather availability assumptions, absent inputs and post-January
observations are blocked. Persistence is allowed only if explicitly selected as an approved model.
The runtime still owns model artifact validation/inference (P2/P6).

One asset per job permits pinning the existing single weatherRunId field. Manifest includes every
requested release, reasons for gaps/failures, input revision IDs, job/forecast/snapshot IDs and hash.
If inputs change between preflight and execution, result verification reports input-version mismatch;
it never silently exports a forecast from different inputs.

`<id>.forecasts.json` enriches canonical values with issuedAt, targetTime, lead, assetId, horizon,
modelVersionId, mode, snapshot hash and weather provenance (including raw artifact ID). Unit remains
normalized. All target hours are retained; `inFebruaryEvaluation` excludes the March tail. No scoring,
MW conversion or invented actuals. `synthetic` is explicit and `officialResult` is always false:
only P7 can qualify an official historical result. Exit 0 means all releases completed, 2 means
explicit gaps/failures/timeout/interruption, 1 means a CLI/storage/DB error.

A hard process kill may leave the lock directory. After verifying no process owns that batch,
remove only its `<id>.json.lock` directory and resume. Never delete another running batch's lock.
Forecast lookup uses the existing canonical store's 100-version filtered limit: if a saved ID has
fallen outside it, export fails explicitly, never substitutes the latest forecast. An exact-ID public
reader can be provided by P6 later if more than 100 revisions per issue/horizon are required.

## Validation

- PASS: `node --import tsx --test tests/replay-batch/*.test.ts` — 9/9.
- PASS: `npm test` — 51/51 including all nine P4 tests.
- PASS: `npm run test:agent` — 12/12; `npm run test:agent:replay` — 1/1.
- PASS: `npm run typecheck`, `npm run lint -- --ignore-pattern .worktrees/**`, `npm run build` (21 pages), CLI --help, and diff/secret review.
- Environment: initial build rejected an external node_modules junction; replaced with a physical
  dependency copy in this worktree, without package/lockfile changes.
- BLOCKED: origin fetch returns Repository not found. No remote completion claimed.
- NOT RUN: real PostgreSQL February batch; requires P1 weather, P2/P6 approved-model wiring and P7.
  Missing February actuals block official evaluation, not forecast generation.

Next: integrate sequentially under the shared main lock, then P7 runs this CLI against disposable
PostgreSQL and records separate synthetic and official evidence.
