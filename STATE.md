# Project state

- Updated UTC: 2026-09-23 10:40Z.
- Branch/worktree: `chore/integrate-s03-weather-runs` / private integration worktree.
- Base: current local `main`/`origin/main` at `8d25bab`; S03 task branch `origin/feat/s03-weather-runs` at `133e82e`.
- Active task: S03 and the latest S05 main update are reconciled and validated; local `main` fast-forward is next. No remote push was requested.
- Demo: portal preview is available at `http://localhost:3107/login` when locally configured. No weather UI/API is wired.

## Integrated implementation

- S03 adds a deterministic Open-Meteo Single Runs connector, cycle selection, provenance/raw-byte hashing, availability policy, complete 24/48-hour target validation, and admissible saved fallback behavior.
- Touched: `src/server/connectors/weather/**`, `src/server/data/weather/**`, `tests/weather/**`, `docs/weather-verification.md`, and `docs/handoffs/kassymzhan-s03.md`.
- The weather persistence port is injected and only has an in-memory test implementation. PostgreSQL restart recovery and canonical S01 table/contract integration remain unimplemented.
- Probe location `43.25, 76.95` is not a confirmed station. Historical publication timestamp and the production availability delay are unapproved; source timezone, interval and target semantics require owner confirmation.
- Existing S00/S01/S02/S04/S05/S06/S07/S08 and protected multilingual portal work remain preserved from the local main base.

## Verification

- PASS on task branch: `node tests/weather/probe.mjs tests/weather/evidence` (five recorded Open-Meteo responses with raw bytes and hashes).
- PASS in this integration worktree: `npm ci --no-audit --no-fund`.
- PASS after merging current `main`: `node --test tests/weather/weather.test.mjs` (25 tests, offline).
- PASS after merging current `main`: `npm run lint`, `npm run typecheck`, `npm run build`.
- BLOCKED: PostgreSQL write/read/restart integration: S01 weather schema and adapter are absent.
- NOT_RUN: whole-month archive coverage using confirmed station coordinates and approved issue schedule.

## Next actions

1. Fast-forward the local `main` to the verified integration commit; do not push it to `origin` unless requested.
2. S01/S03 owners: map the port to canonical immutable `WeatherRun` persistence and verify saved fallback after PostgreSQL restart.
3. Confirm source station, target-time convention and conservative publication delay before exposing weather data in a forecast path.
