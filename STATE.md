# Project state

## Snapshot

- Updated UTC: 2026-09-23 09:27:38Z.
- Branch/worktree: `feat/csv-import-quality`, `C:/Users/elnar.saparov/Desktop/HACK/hack-8e4ccf84-terra-worktrees/csv-import-quality`.
- Base being integrated: verified `origin/main` commit `ed439af`, containing S00/S05/S06/S08.
- S02 implementation commit: `9259c60`; validated handoff commit: `b85c28e`.
- Latest base merge commit: `15cdab2`.
- Demo: set `DATABASE_URL`, run `npm run db:migrate`, then `npm run dev`; UI routes are
  `/overview`, `/forecast`, `/sources`, and `/agent-log`.

## Integrated work

- S00 audit `716c63b`: two UTF-8 ten-minute histories through 2026-01-31, no February actuals,
  and unresolved timezone/physical-unit assumptions.
- S05 dashboard integrated at `ed439af`: Russian overview/forecast/sources/agent-log, explicit
  fixture/API modes, CSV setup UI, quality states, provenance, backtest report and responsive views.
- S06 model integrated through `8a7d746`: ridge/baselines, pre-February validation, artifacts and
  idempotent training jobs.
- S08 backtest integrated through `a29854c`: leakage guards, reproducible metrics/baseline and CSV.
- S02 is this branch's task: confirmed CSV preview; raw SHA-256 artifacts; bounded batches;
  observation revisions; accepted/rejected/duplicate reports; downloadable error rows; connection
  create/list/test APIs; evaluation-only February targets; coverage-aware hourly aggregation.
- Import fingerprints make identical file+mapping imports idempotent. Missing/incomplete hours are
  `null`, never zero, and interval-start/end semantics are explicit.

## Decisions, constraints and risks

- Root `app/` wins over `src/app/`; S02 handlers live in root `app/api/v1/`, matching existing API
  bridges while preserving S05's `src/app` UI implementation.
- Supplied CSVs have 142,360 and 149,499 valid required-field rows, end at
  `2026-01-31 09:50:00`, and contain no February 2026 targets despite their filenames.
- Power remains `normalized`; it is not labelled or summed as MW/MWh.
- Same-origin mutation checks remain. Shared session/auth, durable S08 registry and S04/S07
  production forecast orchestration are still integration dependencies.
- S02 raw artifacts and S06 model artifacts require persistent writable production storage.

## Validation

| Check | Result | Evidence |
|---|---|---|
| Latest pre-S05-merge `npm test` | PASS | 28/28 S02/S06/S08 tests |
| Latest pre-S05-merge lint/build | PASS | Clean lint; Next build emitted all S02/S06/S08 API routes |
| Latest clean PostgreSQL 16 migration/smoke | PASS | Migration applied; repeat kept one import ID and exactly three observations |
| S05 integration checks on main | PASS | 6 UI units, lint/build and 13 browser scenarios recorded by S05 integrator |
| Final combined `npm test` | PASS | 28/28 S02/S06/S08 tests after merging S05 |
| Final UI unit tests | PASS | 6/6 CSV/client adapter tests |
| Final lint/build | PASS | Clean lint; all four UI routes and ten dynamic API routes generated |
| Final clean PostgreSQL migration/smoke | PASS | S02 migration applied; repeat import reused ID and kept three observations |

## Next actions

1. Push the merged `feat/csv-import-quality` branch and verify its upstream commit.
2. Align S05's provisional source adapter with S02 API payloads and run the real E4 UI gate.
3. Feed canonical observations into S06/S08 through `observationsForPurpose`.

## Recent tangible milestones

- 2026-09-23 09:27Z: merged S05 into S02 and passed 28 core tests, 6 UI tests, lint, build and
  clean PostgreSQL validation without discarding S00/S06/S08.
- 2026-09-23 09:24Z: S02/S06/S08 suite passed 28 tests, lint, build and PostgreSQL smoke.
- 2026-09-23 09:26Z: S05 integration verified on `origin/main` at `ed439af`.
