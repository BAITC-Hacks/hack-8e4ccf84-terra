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
