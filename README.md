# Terra — прогнозирование выработки ВЭС

Hackathon team repository for Terra

## CSV imports

The CSV ingestion API requires PostgreSQL and a writable artifact directory:

```powershell
$env:DATABASE_URL = "postgres://user:password@localhost:5432/terra"
$env:ARTIFACT_ROOT = ".data/artifacts"
npm run db:migrate
npm run dev
```

`POST /api/v1/imports` accepts multipart fields `file`, `config` (JSON), and optional
`connectionId`. Send `confirmed: false` first to obtain a preview without persisting data. After
the user confirms the exact mapping, IANA time zone, timestamp meaning, source interval, availability
assumption, and units, repeat with `confirmed: true`.

```json
{
  "assetId": "turbine-1",
  "dialect": {"encoding": "utf-8", "delimiter": ",", "decimalSeparator": "."},
  "mapping": {
    "timestamp": "Статистическое время",
    "windSpeed": "Средняя скорость ветра(m/s)",
    "normalizedPower": "Нормализованная активная мощность",
    "ambientTemperature": "Средняя температура окружающей среды(°C)"
  },
  "time": {
    "format": "yyyy-MM-dd HH:mm:ss",
    "timeZone": "Asia/Almaty",
    "timestampMeaning": "interval_start",
    "sourceIntervalMinutes": 10,
    "availabilityLagMinutes": 10,
    "availabilityAssumption": "available after the source interval"
  },
  "units": {
    "windSpeed": "m/s",
    "normalizedPower": "normalized",
    "ambientTemperature": "degC"
  },
  "hourlyCoverageThreshold": 1,
  "confirmed": false
}
```

Use `GET /api/v1/imports/{id}` for the accepted/rejected/duplicate report and its error-download
URL. CSV connections are managed with `GET/POST /api/v1/connections`; upload a sample file to
`POST /api/v1/connections/{id}/test` to validate its confirmed schema and preview.

The supplied files currently end at `2026-01-31 09:50:00`; despite their filenames, they contain
no February 2026 rows. If future files include February targets, normalized active power is stored
as `evaluation_only` and is filtered from training and feature inputs.

## S09: reproducibility handoff

The reproducibility harness and fixture are an integration contract, not proof that the product
acceptance gates pass. Run the harness with:

```sh
node --test tests/acceptance/harness.test.mjs
```

The documented end-to-end actions are `make import`, `make train`, `make backtest`, `make export`,
and `make verify` (or `node tests/acceptance/run.mjs <action>` on Windows). Each invokes only its
allowlisted `demo:<action>` npm script and fails closed with exit code 2 until the corresponding
owner supplies it. The acceptance matrix and clean-environment/backup procedure are in
[docs/acceptance.md](docs/acceptance.md) and [docs/demo.md](docs/demo.md). The CC0 synthetic smoke
fixture is documented in [samples/README.md](samples/README.md); it is not forecast-quality evidence.

## Wind forecast agent runtime

Apply migrations and configure `DATABASE_URL`, `JOB_TICK_SECRET`, and the agent variables shown in
`.env.example`. `POST /api/v1/agent-runs` accepts the forecast request contract plus an
`Idempotency-Key` header and returns a durable job. Run `node scripts/job-dispatcher.mjs` beside the
application; each protected tick claims and completes exactly one resumable step. Inspect progress
with `GET /api/v1/jobs/{id}` and the decision journal with `GET /api/v1/agent-runs/{id}`.

The production adapter reads only persisted `weather_runs`, `weather_values`, and eligible
observations, uses the approved persistence model through the existing snapshot/forecast stores,
and publishes with a lease-fenced idempotency key. It does not silently fetch demo weather. A real
historical run therefore requires an upstream connector to have populated archival forecast runs.

OpenAI is opt-in: set `AGENT_LLM_ENABLED=true`, `OPENAI_API_KEY`, and an explicitly verified
`OPENAI_MODEL`. With the flag off or a transient invalid response, deterministic gates remain in
control and the audit log records the fallback. The API key is never part of a job or checkpoint.

Durable replay sessions are created through `POST /api/v1/replay-sessions`, inspected through
`GET /api/v1/replay-sessions/{id}`, and advanced monotonically through
`POST /api/v1/replay-sessions/{id}/advance`. Session cursor advancement and replay job enqueue occur
in one PostgreSQL transaction.

Agent checks:

```powershell
npm run test:agent
npm run test:agent:integration # requires a disposable local TEST_DATABASE_URL containing "test"
npm run test:agent:replay
npm run test:agent:openai      # SKIP unless RUN_OPENAI_SMOKE=1
```
