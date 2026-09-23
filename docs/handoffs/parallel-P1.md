# P1 — Canonical archived weather ingestion

Owner: P1 / Codex. Branch: feat/p1-weather-ingestion. Base: local main 1923ce2.
Status: implemented and validated on task branch; local integration pending. Official historical inputs BLOCKED.

## Delivered boundary

- `OpenMeteoWeather.fetch_archive(runId)` downloads only ECMWF IFS Single Runs. It does not assert historical admissibility. Existing `fetch_run(runId, asOf)` retains its availability gate.
- Temporary network/429/5xx failures retry the same URL at most three times; permanent HTTP errors do not retry. Each attempt has a 15-second timeout; failures do not expose response bodies.
- `PostgresWeatherIngestion.save(assetId, savedRun, issuedAt, horizonHours)` validates the raw SHA-256, request identity, asset coordinates, provider grid cell, UTC cycle, complete continuous hourly series, units, finite/ranged values, and target hours issuedAt+1..24/48.
- One transaction writes existing raw_artifacts, weather_runs and weather_values. Exact bytes are stored as base64 in raw_artifacts.metadata; `postgres:weather/<identity>` is a database locator, not an external file path. No migration, new queue, or alternate database.
- Transaction advisory lock plus the existing unique artifact key makes concurrent imports idempotent. Identity includes asset, run/model/provider, raw hash, coordinates and research policy; changed raw/policy produces an immutable revision. All validated provider hours are saved, so repeated 24/48-hour requests share the same run.
- Canonical `wind_speed` is explicitly 100 m; 10 m is `wind_speed_10m`. Temperature is 2 m and direction 100 m. This prevents the current height-blind PostgresAgentPorts from randomly mixing wind heights. It is NOT a claim that 100 m equals turbine hub height. Grid acceptance tolerance is 0.25 degrees latitude/projected longitude; confirmed asset coordinates remain required.
- published_at and canonical available_at remain NULL: the provider response has no historical publication evidence. fetched_at records actual retrieval. Research delay/rationale/reference and assumedAvailableAt are stored in availability_assumption (`kind=research_only`), never promoted to trusted timestamps. Production PostgresAgentPorts rejects these rows, including in replay.

## CLI

Run directly with existing dependencies:

```sh
node --import tsx scripts/weather-ingest.ts /absolute/path/weather-config.json
```

DATABASE_URL must reference the intended canonical database. JSON example (replace the asset UUID with a registered asset with confirmed coordinates):

```json
{
  "assetIds": ["00000000-0000-0000-0000-000000000001"],
  "start": "2026-01-31T12:00:00.000Z",
  "end": "2026-02-28T12:00:00.000Z",
  "timeZone": "UTC",
  "stepHours": 24,
  "horizonHours": 48,
  "mode": "official",
  "availability": {"kind": "observed"}
}
```

The range is inclusive and UTC-hour-aligned; timeZone must explicitly name the IANA zone UTC. Other calendars are rejected; no OS timezone inference. JSONL reports one row per asset/issue, coverage, stored run ID, inserted/reused state and exact safe blocker. Exit 2 means historical eligibility is blocked (including complete archived coverage); exit 1 means configuration/database failure. A missing archive is never replaced with actual weather. Research mode permits an explicit assumed policy with delayHours/rationale/approvalReference but remains officially BLOCKED. The existing 48-hour lookback selects candidates; the first complete retrieved run is stored. No automatic production wiring is added (P6 ownership).

## Validation

- PASS: `node --test tests/weather/weather.test.mjs` — 25/25 offline existing regression tests.
- PASS: `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55431/weather_test_cli2 node --import tsx --test tests/weather/ingestion.test.ts` — 3/3, PostgreSQL 16 disposable database. Tests prove raw/run/value rollback, invisibility before commit, concurrent first insertion and restart idempotence, consumer selection with TEST-ONLY publication evidence, rejection of unknown/future publication/availability, and real CLI two-release repeatability with mocked HTTP.
- PASS: npm test — 44 passed, database test skipped without TEST_DATABASE_URL (executed separately above).
- PASS: npm run lint; npm run typecheck; npm run build (21 pages). Final rerun after CLI fix passed. Agent 12/12 and foundation 4/4 also passed.
- Initial failures fixed: shared node_modules junction rejected by Turbopack (installed dependencies inside worktree); JSON typing; retry-count test expectation; CLI download clock race (separate archival fetch).
- Live network smoke not run. Saved real provider evidence is from existing tests/weather/evidence; mocked CLI responses are synthetic test fixtures and never official historical evidence.

## Blockers and next action

1. Historical publication remains UNKNOWN. Single Runs API exposes initialization-specific forecasts, not proof of past publication: https://open-meteo.com/en/docs/single-runs-api (checked 2026-09-23). Obtain verifiable provider publication/availability evidence before adding a trusted provider adapter; do not fill timestamps by SQL as done only in isolated consumer tests.
2. February actuals and confirmed turbine semantics are external to P1. No February score or combined P7 E2E is claimed.
3. Remote fetch returns Repository not found. Preserve local implementation, integrate serially with the shared lock, and retry remote delivery when access is restored.
