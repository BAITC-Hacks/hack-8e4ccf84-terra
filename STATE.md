# Project state — local main integration

- Updated (UTC): 2026-09-23 09:31Z
- Branch/worktree: `chore/integrate-s04-local` / `.worktrees/s04-integration`
- Last verified prior commit: `0248d79` (local main, includes S01 and S07); pending merge includes S04 `9802da4`
- Remote freshness: UNKNOWN. Fetch returned `Repository not found`; the user requested local main integration and will push personally.
- Demo path: `npm run dev` exposes the S05 Russian dashboard at `/overview`, `/forecast`, `/sources`, `/agent-log`. The S04 authenticated API produced a 24-hour published baseline in an isolated PostgreSQL smoke test. A real S02/S03 data flow has not been demonstrated.

## Integrated and active slices

- S00: data audit in `docs/data-contract.md` and `docs/data-audit.md`. Source time convention, power normalization/physical units, and shared-line semantics remain unconfirmed; February actuals are evaluation-only.
- S01: PostgreSQL schema/migration, canonical contracts, administrator sessions, protected API/tick, Compose and health; validated on its separate task branch, included here through S04 dependency.
- S04: immutable as-of snapshot payload, eligible persistence baseline, exact 24/48-hour validation, idempotent key, versions and previous link, transactional PostgreSQL publication, incomplete status without points, protected POST/GET forecast routes. Branch commit `9802da4`.
- S05: Russian dashboard, source/forecast/agent pages, explicit fixture and real-API states, CSV UI, responsive views. Previously integrated on `origin/main`; real S04 API alignment remains to verify.
- S06: ridge training and empirical curve with pre-February validation, JSON artifacts and training-job endpoint. Previously integrated; real model quality remains unverified.
- S08: sequential backtest/evaluation/export and temporal leakage checks. Previously integrated; production seams await S04/S07.
- S02/S03: canonical import and weather adapters are not present in this integration. S04 reads their intended S01 tables through typed interfaces. S07 job stores, replay, agent workflow and dispatcher are integrated on local main at `0248d79`; the protected tick remains an idle adapter and is not yet wired to S04.

## S04 decisions and checks

- Target labels are whole UTC hours `T+1h` through `T+N h`; source interval convention must be confirmed before official export. No clipping to `[0,1]` and no MW/MWh conversion.
- Backtest `history_only` excludes February facts; production forecasts reject `evaluation_only`. Inputs require known `available_at <= T`, complete hourly weather coverage, and an eligible power observation.
- PASS before merge: 8 fixture/foundation tests, ESLint, TypeScript, and `next build --webpack`.
- PASS before merge: isolated PostgreSQL migration and S04 integration test (retry, version 2, future-fact guard, rollback after forced value-insert failure).
- PASS before merge: HTTP smoke (anonymous 401, login 200, POST 201, GET 200, repeated ID, invalid horizon 400).
- Default Turbopack build in the S04 worktree was blocked by its local `node_modules` junction outside the filesystem root; webpack production build passed.
- No post-merge test run was requested by the user.

## Risks and next actions

1. Finish this merge, update local `main`, and leave both branches unpushed for the user.
2. Restore GitHub access and push local `main` when the user is ready; do not claim remote integration before verifying it.
3. When S02/S03 land, reconcile metric and quality vocabulary, weather publication timing, S05 API contract, and wire the integrated S07 queue to the same S04 publication service.
