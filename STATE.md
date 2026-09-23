# Project state — local main integration

- Updated UTC: 2026-09-23 11:45Z
- Branch/worktree: `chore/integrate-agent-system-problems` / private integration worktree.
- Last verified integration commit: `d2d4454` on `origin/main`; agent audit task commit `f436946` is a verified ancestor.
- Active task: agent subsystem audit documentation completed; runtime code was not changed.
- Demo: S05 fixture dashboard remains at `/overview`, `/forecast`, `/sources`, `/agent-log`. With PostgreSQL and `DATABASE_URL`, run `npm run db:migrate`, then `npm run dev`; CSV APIs are under `/api/v1/imports` and `/api/v1/connections`.

## Preserved work

- S00 audit `716c63b`: two separate ten-minute CSV histories through 2026-01-31, no February actuals. See `docs/data-contract.md` and `docs/data-audit.md`.
- S01 `49fda2d`, `848bef1`, `bebdcef`, `9820c90`: shared contracts, §7 PostgreSQL migration, Compose persistent volumes, administrator session, protected `/api/v1/*`, separate tick secret, health/assets APIs and S08 server-token bridge.
- S04 `9802da4`: immutable as-of snapshot, baseline, exact 24/48-hour validation, idempotency, previous-version links, transactional PostgreSQL publication and protected forecast API.
- S05 `f3299ee`: Russian dashboard with chart/table, filters, provenance, CSV preview/import UI and agent journal. Real API alignment remains open; see `tests/ui/README.md`.
- S06 `d094908`: nonlinear ridge/power-curve model, train-only scaling, resumable training and durable training-job enqueue; artifacts default to `.data/ml`.
- S07 `564a09e` through `bf4f1fd`: fixture/PostgreSQL job stores, atomic claim, fenced lease/heartbeat/checkpoint, bounded retry, idempotent trigger, agent decisions and replay. Protected tick is still an idle adapter.
- S08 `5ce6748`: sequential backtest, evaluator-only actuals, leakage checks, February metrics, common-pair baseline and CSV export. Registry remains in memory.
- S02: SHA-256 artifacts, bounded/idempotent CSV import, observation revisions, error reports/downloads, connection APIs and coverage-aware hourly aggregation are merged in this integration worktree. S03 weather adapters are not present.
- Documentation: `docs/hackalem-ai-agentic-wind-forecasting.md` is a verified Markdown transcription of the HackAlem AI case specification.

## Decisions and risks

- Source timezone, interval convention, physical power units, normalization, target object, availability and official issue schedule remain unconfirmed. Keep source rows separate and February fact evaluation-only; no MW/MWh conversion or official quality claim.
- S01 proxy requires an admin cookie for all `/api/v1/*`; for S08 routes it forwards server-only `ADMIN_API_TOKEN` after validation. Dispatcher uses `JOB_TICK_SECRET`.
- Root `app/` is the effective App Router. S04/S06/S08 API and S05 UI routes remain.
- S05 real API adapter, S07 tick, S08 production persistence and real S02/S03 inputs await integration.

## Validation

| Check | Result |
|---|---|
| S01 standalone lint, typecheck, build, three auth tests | PASS before merge |
| S01 clean Compose migration and HTTP auth/API smoke with random test secrets | PASS before merge |
| S04 fixture/foundation, PostgreSQL, HTTP, lint/typecheck and webpack build | PASS before this merge, as recorded by S04 owner |
| S05/S06/S07/S08 prior checks | PASS before this merge, as recorded by their owners |
| Conflict resolution | PASS: package scripts combined and idempotent migration runner retained |
| Combined TypeScript tests | PASS: 28/28 |
| Foundation authentication tests | PASS: 3/3 |
| Lint | PASS |
| Typecheck | PASS |
| Production build | PASS: Next.js generated CSV and existing routes |
| Push to `origin/main` | PASS: `c613fb3`; task commit `9259c60` verified as ancestor |
| PDF extraction and visual source review | PASS: both source PDF pages rendered and checked; Markdown matches headings, requirements, links, and 100-point rubric |
| Agent audit scope against `origin/main` `8895ba8` | PASS: production agent paths and integration boundaries inspected |
| Agent fixture workflow tests | PASS: 7/7; PostgreSQL test SKIPPED because `TEST_DATABASE_URL` is unset |
| Agent-focused ESLint and exact-commit TypeScript check | PASS |
| Documentation task branch push | PASS: `origin/docs/agent-system-problems` at `f436946` |
| Agent audit integration push | PASS: `origin/main` at `d2d4454`; task commit ancestor verified |

## Next actions

1. Implement the agent fixes in the priority order recorded by `docs/agent-system-problems.md`.
2. Run AT-AG-01–AT-AG-18 before declaring the agent subsystem ready.
3. Configure `TEST_DATABASE_URL` and rerun the PostgreSQL agent test.
