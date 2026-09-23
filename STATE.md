# Project state

- Updated UTC: 2026-09-23 10:50Z.
- Branch/worktree: `chore/integrate-s03-weather-runs` / private integration worktree.
- Base reconciled: local `main` at `b6a3b4b` (S09 integration); remote remains `origin/main` at `8d25bab` because this is a local-only integration.
- Active task: S03 and S09 are reconciled and validated; local `main` fast-forward is next.
- Demo: portal preview is available at `http://localhost:3107/login` when locally configured. No weather UI/API is wired.

## Integrated implementation

- S03 adds an Open-Meteo Single Runs connector, cycle selection, provenance/raw-byte hashing, availability policy, complete 24/48-hour target validation, and admissible saved fallback behavior.
- S09 adds a deterministic CC0 48-hour smoke fixture, Makefile targets, fail-closed verification wrapper, acceptance matrix, and clean-environment/backup procedure. It does not assert model quality or successful AC-01–AC-16.
- S03 persistence remains an injected test-only in-memory port; PostgreSQL restart recovery and canonical S01 `WeatherRun` integration are unimplemented.
- Probe coordinates `43.25, 76.95` are not a confirmed station. Historical publication timestamp, production availability delay, source timezone, interval, and target semantics need owner confirmation.
- Existing S00/S01/S02/S04/S05/S06/S07/S08 and protected multilingual portal work are retained.

## Verification

- PASS after S03/S09 reconciliation: `node --test tests/weather/weather.test.mjs` (25 offline tests), `node --test tests/acceptance/harness.test.mjs` (2 tests), `npm run lint`, `npm run typecheck`, and `npm run build`.
- PASS expected fail-closed behavior: `node tests/acceptance/run.mjs verify` exits 2 / `BLOCKED` without a `demo:verify` contract; this is not product acceptance.
- BLOCKED: PostgreSQL weather persistence/restart validation and actual station/month coverage.

## Next actions

1. Fast-forward local `main` to this verified integration commit; do not push without a user request.
2. Implement canonical immutable `WeatherRun` persistence via S01 and verify saved fallback after PostgreSQL restart.
3. Owners S01–S08 must supply fixed `demo:*` contracts and pass AC-01–AC-16; wire S03 weather and real data/UI integration before operational use.
