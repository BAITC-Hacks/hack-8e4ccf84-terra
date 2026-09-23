# Project state

## Snapshot

- Updated UTC: 2026-09-23 09:23:00Z.
- Branch/worktree: `feat/csv-import-quality`, `C:/Users/elnar.saparov/Desktop/HACK/hack-8e4ccf84-terra-worktrees/csv-import-quality`.
- Base: rebasing S02 onto verified `origin/main` integration commit `ed2ddf6`.
- Demo: set `DATABASE_URL`, run `npm run db:migrate`, then `npm run dev`.

## Integrated work

- S00 / E1 audit is integrated via `716c63b`: two UTF-8 ten-minute histories through
  2026-01-31, no February actuals, and unresolved timezone/physical-unit assumptions.
- S06 / E5 is integrated through `8a7d746`: nonlinear ridge, baselines, pre-February validation,
  model artifacts and idempotent training jobs.
- S08 / E7 is integrated through `ed2ddf6`: historical runner, leakage guards, reproducible
  February metrics, baseline comparison and CSV export.
- S02 / E2 CSV, quality and observations is the active branch task. It adds confirmed CSV preview,
  raw SHA-256 artifacts, bounded batches, observation revisions, accepted/rejected/duplicate
  reports and downloadable errors.
- Import fingerprints prevent repeated file+mapping imports from duplicating observations. Hourly
  aggregation exposes coverage and null gaps with explicit interval-start/end semantics. February
  2026 normalized-power targets are evaluation-only.
- New routes: `POST /api/v1/imports`, `GET /api/v1/imports/{id}`, error download,
  `GET/POST /api/v1/connections`, and `POST /api/v1/connections/{id}/test`.

## Decisions, constraints and risks

- Root `app/` wins over `src/app/`; active S02 handlers therefore live under `app/api/v1/`,
  consistent with the existing bridge approach.
- Supplied CSVs contain 142,360 and 149,499 valid required-field rows and both end at
  `2026-01-31 09:50:00`. Neither contains February 2026 targets despite the filenames.
- Normalized power remains unit `normalized`; it is never labelled/summed as MW or MWh.
- Existing same-origin protection is preserved. Full session authorization remains an upstream
  contract; S08's protected handlers are unchanged.
- S08's in-memory registry and prediction seam still require S04/S07/PostgreSQL integration.
- S06 model artifacts and S02 raw artifacts require persistent writable storage in production.

## Validation

| Check | Result | Evidence |
|---|---|---|
| S02 `npm test` before latest rebase | PASS | 9/9: confirmation, reports/revisions, idempotency, February isolation, coverage/null gaps and interval-end bucketing |
| S02 PostgreSQL 16 migration/smoke | PASS | Clean migration; one row created three observations and repeat reused import ID |
| Combined S02+S06 test/lint/build on prior base | PASS | 15/15 tests; lint clean; all S02 and S06 routes built |
| Latest S02+S06+S08 post-rebase checks | NOT_RUN | Run after this conflict resolution |

On a clean worktree, standalone `tsc` initially cannot see generated `LayoutProps`; `next build`
generates Next types and passes typecheck, after which standalone `tsc` passes.

## Blockers and next actions

1. Finish the latest rebase and run all S02/S06/S08 tests, lint, build and PostgreSQL smoke test.
2. Push `feat/csv-import-quality` and record its verified remote commit.
3. Connect canonical observations to S06 training/S08 evaluator through
   `observationsForPurpose`, and wire the source-management UI.

## Recent tangible milestones

- 2026-09-23 09:23Z: reconciled S02 with the newly integrated S08 state without discarding S00/S06.
- 2026-09-23 09:21Z: S08 integration was verified on `origin/main` at `ed2ddf6`.
- 2026-09-23 09:12Z: S02 migration and production repository idempotency passed on disposable
  PostgreSQL 16.
