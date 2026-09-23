# Project state

## Snapshot

- Updated UTC: 2026-09-23 09:08:36Z.
- Branch/worktree: `feat/backtest-evaluation-export`, `C:/Users/elnar.saparov/Desktop/HACK/hack-8e4ccf84-terra-worktrees/backtest-evaluation-export`.
- Rebased task commit: `5ce6748` on `origin/main` at `f7d1ed9`; this verified handoff update is uncommitted.
- Demo: production Next.js exposes `POST /api/v1/backtest-jobs`, `GET /api/v1/evaluations/{id}` and `GET /api/v1/forecasts/{id}/export`; set `ADMIN_API_TOKEN` and use a matching Bearer token.

## Integrated foundation and current task

- S00 / E1 audit is integrated on `main` via `716c63b` and follow-up state. It verified two UTF-8 ten-minute CSV histories through 2026-01-31, with no February actuals.
- S00 constraints remain authoritative: power is source-scale 0–1 with UNKNOWN physical semantics; source timezone, interval convention, measurement availability and official issue schedule remain UNKNOWN; the two series must not be summed or labelled MW/MWh.
- S08 / E7 backtest, evaluation and export, owner Codex, status `VALIDATED` on the task worktree.
- Implemented a sequential historical runner behind an injected production forecast-service boundary, an evaluator-only actuals reader, leak checks, deterministic rerun comparison, February metrics and FR-10 CSV export.
- Metrics include MAE, RMSE, N, coverage and exclusions overall, per asset, per lead bucket 1–24/25–48 and per asset/lead. Baseline comparison uses only common finite pairs; N=0 is represented by null metrics.
- March target tails remain exportable but are excluded from the fixed `[2026-02-01, 2026-03-01)` evaluation interval. Training cutoff cannot exceed the issue time or 2026-01-31.
- API requests require an explicit ordered UTC issue schedule, return 202 with idempotent `job_id`, reject conflicting idempotency keys and use safe error envelopes.

## Integration constraints

- `origin/main` does not yet contain S01/S04/S06/S07. Updated `SLICES.md` explicitly permits S08 to start with local interfaces and fixtures before Gate C.
- The in-memory registry is an integration adapter, not durable storage. S01/S07 must connect queue/persistence and S04/S06 must implement `BacktestForecastService` before a real February run.
- Root `app/` currently wins over `src/app/`; small bridge handlers make the required API routes live without moving another owner's App Router files.
- February actuals remain evaluation-only and are absent from the supplied resources, so no real February quality claim is made.

## Validation

| Check | Result | Evidence |
|---|---|---|
| `npx --yes tsx --test tests/backtest/*.test.ts` | PASS | 13/13: metrics, common-pair baseline, March exclusion, N=0, sequential isolation, leakage, cutoff, 1e-6 reproducibility, CSV and API/idempotency/auth |
| `npm run lint -- --no-cache` | PASS | ESLint exit 0 after rebase; an earlier combined command was interrupted after a silent wait and rerun separately |
| `npx tsc --noEmit` | PASS | TypeScript exit 0 after Next type generation |
| `npm run build` | PASS | Next.js 16.3.6 compiled; all three S08 API routes appear as dynamic routes |
| Manual production HTTP check on port 3108 | PASS | First POST queued; same key/body reused same job; unauthenticated POST returned 401 |
| S00 CSV/PDF audit checks | PASS | Results and exact evidence remain in `docs/data-audit.md` and commit `716c63b` |
| Secret-pattern review | PASS | Findings are existing environment-variable names, redaction options or a test-only dummy token |

## Blockers, risks and next actions

1. Commit this post-rebase handoff, push the task branch, and integrate it into `main` from a separate worktree.
2. At Gate C, connect `BacktestForecastService`, `ActualsReader` and `BacktestRegistry` to canonical S04/S06/S07 contracts and PostgreSQL; remove root route bridges if S01 moves the app to `src/app`.
3. Obtain February evaluation-only actuals and the organizer-approved release schedule before producing an official evaluation report.

## Recent tangible milestones

- 2026-09-23 09:01Z: S08 passes 13 focused tests, lint, typecheck, production build and a live protected/idempotent HTTP smoke test.
- 2026-09-23 08:51Z: S00 audit and data contract verified and integrated; unresolved source semantics remain explicit.
