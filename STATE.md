# Project state

## Snapshot

- Updated UTC: 2026-09-23 09:13:16Z.
- Branch/worktree: integration branch `chore/integrate-s08-backtest`, `C:/Users/elnar.saparov/Desktop/HACK/hack-8e4ccf84-terra-worktrees/integrate-s08-backtest`.
- Integration includes current `origin/main` at `8a7d746` (S00 and S06) plus S08 commits `5ce6748` and `c9cd19b`; merge and validation are in progress.
- Demo APIs: `POST /api/v1/training-jobs`, `POST /api/v1/backtest-jobs`, `GET /api/v1/evaluations/{id}`, and `GET /api/v1/forecasts/{id}/export`.

## Integrated work

- S00 / E1 audit is integrated via `716c63b`. It verified two UTF-8 ten-minute CSV histories through 2026-01-31, with no February actuals.
- S06 / E5 is integrated via `d094908`: nonlinear ridge features, train-only scaling, resumable training checkpoints, empirical curve/baseline, pre-February rolling validation, deterministic selection, JSON artifacts and idempotent durable training jobs.
- S08 / E7, owner Codex, status `INTEGRATION_VALIDATED` before the latest S06 merge; task branch `origin/feat/backtest-evaluation-export` is pushed.
- S08 adds a sequential historical runner behind an injected production forecast-service boundary, evaluator-only actuals, temporal leak checks, deterministic rerun comparison, February metrics and FR-10 CSV export.
- Metrics expose MAE, RMSE, N, coverage and exclusions overall, per asset, per lead bucket 1–24/25–48 and per asset/lead. Baseline comparison uses common finite pairs; N=0 is null, not zero error.
- March target tails remain exportable but outside `[2026-02-01, 2026-03-01)`. Training cutoff cannot exceed the issue time or 2026-01-31.

## Decisions, constraints and risks

- S00 remains authoritative: power has UNKNOWN physical semantics; timezone, interval convention, availability and official issue schedule are unresolved. Do not sum source series or label MW/MWh.
- February actuals are absent and remain evaluation-only. No real February model-quality claim is made.
- S08's `BacktestForecastService` is the explicit seam for S04/S06's production predictor; S04 forecast publication and S07 orchestration are not yet integrated on `main`.
- S08's in-memory registry is an integration adapter, not durable storage. S01/S07 must connect queue/persistence before real operation.
- S06 training jobs persist to `.data/ml`; production must mount it or set `ML_ARTIFACT_DIR`.
- Root `app/` currently wins over `src/app/`; bridge handlers expose canonical handlers until S01 resolves the layout.

## Validation

| Check | Result | Evidence |
|---|---|---|
| S08 `npx --yes tsx --test tests/backtest/*.test.ts` | PASS | 13/13 before latest-main merge: metrics, baseline pairing, March exclusion, leakage, cutoff, 1e-6 repeatability, CSV, API/auth/idempotency |
| S06 `npm test` | PASS | 6/6 on its integrated branch: scaling, checkpoint, finite guards, power curve, leakage/fair pairs, durable artifact |
| S08 lint/build/typecheck | PASS | Next.js generated three dynamic S08 routes; lint and post-build standalone typecheck passed |
| S06 lint/build | PASS | Dynamic training route generated and production build/typecheck passed |
| Manual S08 production HTTP | PASS | First POST queued, repeated key/body reused the job, unauthenticated POST returned 401 |
| S00 CSV/PDF audit | PASS | Evidence remains in `docs/data-audit.md` and commit `716c63b` |
| Combined S06+S08 integration suite | NOT_RUN | Run after completing this merge conflict resolution |

On a clean worktree, standalone `tsc` initially cannot see generated `LayoutProps`; `next build` generates the Next types and passes typecheck, after which `npx tsc --noEmit` passes. This is a pre-existing project ordering constraint.

## Blockers and next actions

1. Commit the reconciled S06+S08 merge, run both focused suites, lint, build and post-build typecheck, then fetch and push the integration HEAD to `main`.
2. At Gate C, connect S08's forecast, actuals and registry interfaces to S04/S06/S07 and PostgreSQL; remove root bridges if S01 moves the App Router.
3. Obtain February evaluation-only actuals and the organizer-approved schedule before producing an official evaluation report.

## Recent tangible milestones

- 2026-09-23 09:13Z: latest `origin/main` S06 work merged into the S08 integration worktree; state conflict reconciled without discarding either slice.
- 2026-09-23 09:01Z: S08 passed 13 focused tests, lint, typecheck, build and protected/idempotent HTTP smoke test.
- 2026-09-23 09:12Z: S06 integration passed fresh install, 6 ML tests, lint and build before its `main` push.
