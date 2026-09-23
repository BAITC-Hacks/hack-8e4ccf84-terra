# Project state — local integration

- Updated UTC: 2026-09-23 09:29Z
- Branch/worktree: `chore/integrate-s01-local` / `.worktrees/s01-integration`
- Last verified prior commit: `ed2ddf6` on local `main`; S01 task branch ends at `9820c90`
- Remote: cached `origin/main` at `ed2ddf6`; freshness UNKNOWN because GitHub fetch returns `Repository not found`
- Demo path: Compose with configured secrets starts PostgreSQL, applies `0001_foundation.sql`, and serves `/health`, admin session, assets API and protected tick. S06/S08 routes are present; combined integration validation is pending.

## Integrated and active work

- S00: audited two ten-minute CSV histories through 2026-01-31. No February actuals; timezone, interval convention, power semantics, availability, target object and issue schedule remain unresolved. See `docs/data-contract.md` and `docs/data-audit.md`.
- S06: nonlinear TypeScript model, training validation and artifacts are present on local `main`; prior checks are recorded in Git history.
- S08: backtest/evaluation/export and in-memory registry are present on local `main`; prior checks are recorded in Git history. Its own token guard is bridged by S01 proxy after admin cookie validation.
- S01: `49fda2d` contracts, `848bef1` database/Compose/auth, `bebdcef` placeholder secret hardening, `9820c90` S08 auth bridge are being merged. The migration supplies assets, connectors, observations, weather, models, snapshots, forecasts, jobs, events and evaluation tables.
- S04 and S07 are developing in separate worktrees. The tick endpoint is a protected idle adapter until S07 integration; S04 forecast publication is not integrated.

## Decisions and risks

- Keep source series separate; do not label normalized power as MW/MWh or invent UTC conversion. Nullable/configurable S01 fields preserve these unknowns.
- All `/api/v1/*` requests require an administrator session; S08 routes additionally receive their server-only `ADMIN_API_TOKEN` from S01 proxy. The dispatcher uses a separate `JOB_TICK_SECRET`.
- Root `app/` is the effective App Router. Existing S06/S08 bridge routes stay in place.
- S08's registry remains in memory until its owner connects durable services. No real February model-quality result is claimed.

## Validation

| Check | Result |
|---|---|
| S01 standalone build, lint, typecheck, three auth tests | PASS before merge |
| S01 clean Compose migration and HTTP auth/API smoke with random test secrets | PASS before merge |
| Combined `npm test`, backtest tests, lint, build and typecheck | NOT_RUN after merge |
| Combined Compose/API smoke | NOT_RUN after merge |
| Git fetch/push | BLOCKED: remote says `Repository not found`; user will push local main |

## Next actions

1. Resolve the shared `package.json` and `STATE.md` conflicts without dropping S06/S08 work; run combined checks.
2. Commit the validated merge in this integration worktree and fast-forward local `main`. The user will push it.
3. Connect S04/S07/S02/S03 modules through the published S01 contracts as their branches land; preserve S00 unknowns.
