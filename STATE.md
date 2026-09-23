# Project state

- Updated UTC: 2026-09-23 10:49Z.
- Branch/worktree: `fix/test-login` / task worktree; last verified commit `uncommitted`.
- Base: local `main` at `0def4de`; `git fetch --all --prune` is BLOCKED because GitHub reports `Repository not found`.
- Active task: local demo sign-in with editable username and `test` / `test` credentials is implemented and validated; commit and local-main integration are next.
- Demo: development server is running at `http://localhost:3000/login`; `test` / `test` signs in and opens `/overview`.

## Integrated implementation

- S03 adds an Open-Meteo Single Runs connector, cycle selection, provenance/raw-byte hashing, availability policy, complete 24/48-hour target validation, and admissible saved fallback behavior.
- S09 adds a deterministic CC0 48-hour smoke fixture, Makefile targets, fail-closed verification wrapper, acceptance matrix, and clean-environment/backup procedure. It does not assert model quality or successful AC-01–AC-16.
- S03 persistence remains an injected test-only in-memory port; PostgreSQL restart recovery and canonical S01 `WeatherRun` integration are unimplemented.
- Probe coordinates `43.25, 76.95` are not a confirmed station. Historical publication timestamp, production availability delay, source timezone, interval, and target semantics need owner confirmation.
- Existing S00/S01/S02/S04/S05/S06/S07/S08 and protected multilingual portal work are retained.
- Authentication now validates an explicit username and password. Short demo passwords are accepted only outside production; production still requires a non-placeholder password of at least 12 characters.

## Verification

- PASS after S03/S09 reconciliation: `node --test tests/weather/weather.test.mjs` (25 offline tests), `node --test tests/acceptance/harness.test.mjs` (2 tests), `npm run lint`, `npm run typecheck`, and `npm run build`.
- PASS for test login: `node --test tests/foundation/session.test.mjs` (4 tests), `node --test tests/ui/platform.test.cjs` (4 tests), `npm run lint`, `npm run typecheck`, and `npm run build`.
- PASS repository suite: `npm test` (28 tests).
- PASS manual HTTP flow: `test` / `test` returns 200, authenticated `/overview` returns 200, and a wrong username returns 401.
- PASS expected fail-closed behavior: `node tests/acceptance/run.mjs verify` exits 2 / `BLOCKED` without a `demo:verify` contract; this is not product acceptance.
- BLOCKED: PostgreSQL weather persistence/restart validation and actual station/month coverage.
- BLOCKED: remote fetch/push because `origin` currently responds with `Repository not found`.

## Next actions

1. Commit `fix/test-login`, merge it through a private integration worktree, and verify local `main` contains the task commit.
2. Retry remote synchronization when GitHub access is restored.
3. Implement canonical immutable `WeatherRun` persistence via S01 and verify saved fallback after PostgreSQL restart.
