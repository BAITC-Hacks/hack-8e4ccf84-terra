# Project state

## Snapshot

- Updated UTC: 2026-09-23 09:19:28Z.
- Branch/worktree: integration branch `chore/integrate-s08-backtest`, `C:/Users/elnar.saparov/Desktop/HACK/hack-8e4ccf84-terra-worktrees/integrate-s08-backtest`.
- Integration includes current `origin/main` at `68e0714` (S00 and verified S06 state) plus S08 commits `5ce6748` and `c9cd19b`; S08 main push is pending.
- Demo APIs: `POST /api/v1/training-jobs`, `POST /api/v1/backtest-jobs`, `GET /api/v1/evaluations/{id}`, and `GET /api/v1/forecasts/{id}/export`.

## Integrated work

- S00 / E1 audit is integrated via `716c63b`. It verified two UTF-8 ten-minute CSV histories through 2026-01-31, with no February actuals.
- S06 / E5 is integrated and verified on `origin/main` via `d094908` and integration commit `8a7d746`: nonlinear ridge features, train-only scaling, resumable training, empirical curve/baseline, pre-February rolling validation, deterministic selection, JSON artifacts and durable idempotent training jobs.
- S08 / E7, owner Codex, status `INTEGRATION_VALIDATED`; task branch `origin/feat/backtest-evaluation-export` points to validated handoff `c9cd19b`.
- S08 adds a sequential historical runner behind an injected production forecast-service boundary, evaluator-only actuals, temporal leak checks, deterministic rerun comparison, February metrics and FR-10 CSV export.
- Metrics expose MAE, RMSE, N, coverage and exclusions overall, per asset, per lead bucket 1–24/25–48 and per asset/lead. Baseline comparison uses common finite pairs; N=0 is null, not zero error.
- March target tails remain exportable but outside `[2026-02-01, 2026-03-01)`. Training cutoff cannot exceed the issue time or 2026-01-31.

## Decisions, constraints and risks

- S00 remains authoritative: power has UNKNOWN physical semantics; timezone, interval convention, availability and official issue schedule are unresolved. Do not sum source series or label MW/MWh.
- February actuals are absent and remain evaluation-only. No real February model-quality claim is made.
- S08's `BacktestForecastService` is the seam for S04/S06's production predictor; S04 forecast publication and S07 orchestration are not yet integrated.
- S08's in-memory registry is an integration adapter, not durable storage. S01/S07 must connect queue/persistence before real operation.
- S06 artifacts default to `.data/ml`; production must mount it or set `ML_ARTIFACT_DIR`.
- Root `app/` currently wins over `src/app/`; bridge handlers expose canonical handlers until S01 resolves the layout.

## Validation

| Check | Result | Evidence |
|---|---|---|
| Clean integration `npm ci` | PASS | 377 packages installed, audit reported zero vulnerabilities |
| S06 `npm test` | PASS | 6/6: scaling, checkpoint resume, finite guards, power curve, February leakage/fair pairs, durable artifact |
| S08 `npx tsx --test tests/backtest/*.test.ts` | PASS | 13/13: metrics, baseline pairs, March exclusion, N=0, sequential isolation, leakage, cutoff, 1e-6 repeatability, CSV, API/auth/idempotency |
| `npm run lint -- --no-cache` | PASS | Full combined tree exited 0 |
| `npm run build` | PASS | Next.js 16.3.6 compiled and generated all four S06/S08 dynamic API routes |
| Post-build `npx tsc --noEmit` | PASS | Combined TypeScript tree exited 0 |
| Manual S08 production HTTP | PASS | First POST queued, repeated key/body reused the job, unauthenticated POST returned 401 |
| S00 CSV/PDF audit | PASS | Evidence remains in `docs/data-audit.md` and commit `716c63b` |

On a clean worktree, standalone `tsc` initially cannot see generated `LayoutProps`; `next build` generates the Next types and passes typecheck, after which standalone `tsc` passes. This is a pre-existing project ordering constraint.

## Blockers and next actions

1. Commit this final state reconciliation, fetch `origin/main`, push the integration HEAD to `main`, and verify S08 implementation `5ce6748` is an ancestor.
2. At Gate C, connect S08's forecast, actuals and registry interfaces to S04/S06/S07 and PostgreSQL; remove root bridges if S01 moves the App Router.
3. Obtain February evaluation-only actuals and the organizer-approved schedule before producing an official evaluation report.

## Recent tangible milestones

- 2026-09-23 09:19Z: combined S06+S08 integration passed clean install, 6 ML tests, 13 backtest tests, lint, build and post-build typecheck.
- 2026-09-23 09:14Z: S06 verified integrated on `origin/main`; its implementation is an ancestor of `8a7d746`.
- 2026-09-23 09:01Z: S08 passed protected/idempotent HTTP smoke testing on the task branch.

## Remote result

- S06 feature branch: `origin/feat/typescript-model-validation` at `865262d`; verified main integration `8a7d746`.
- S08 feature branch: `origin/feat/backtest-evaluation-export` at `c9cd19b`; main integration pending.
- No deployment was performed.
