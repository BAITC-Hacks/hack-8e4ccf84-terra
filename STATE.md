# Project state — S01 branch

- Updated (UTC): 2026-09-23 09:26Z
- Branch/worktree: `feat/s01-foundation` / `.worktrees/s01-foundation`
- Last verified prior commit: `bebdcef` (S01 secret hardening); this handoff accompanies the S08 auth bridge
- Base: cached `origin/main` at `c2b4003`; remote freshness UNKNOWN because fetch returns `Repository not found`
- Demo path: `docker compose --env-file .env.example -p terra-s01-check up --build -d`; `/health` responds 200, admin login and protected assets API work on the local test stack

## Active task

S01 / owner Бибарыс / VALIDATED locally; remote publication pending. Acceptance: shared contracts, §7 schema and migrations, Next.js/PostgreSQL Compose with persistent volumes, administrator session, protected `/api/v1/*`, separately protected jobs tick, `GET /health`, clean migration and anonymous access checks. Touched: `src/server/contracts/**`, `src/server/db/**`, `src/server/auth/**`, `app/api/**`, `app/health/**`, `proxy.ts`, root configs, `scripts/migrate.mjs`, `tests/foundation/**`.

## Verified decisions

- The provided PDF asks for 24–48 hourly forecasts using weather available at each historical issue time. S01 persists availability timestamps and explicit assumptions; timezone, power scale, and source timing remain configurable or nullable pending S00 audit.
- S04 requested immutable snapshot payload plus forecast idempotency and version links. These fields are included in the S01 migration/type update. S07 owns JobStep execution; tick is currently an authenticated idle adapter.
- Published `.env.example` placeholder values are rejected by admin and tick authentication. A second clean Compose run used random local test values; its temporary containers, volumes, and env file were removed after verification.
- The current local `main` includes S08 routes whose own handler requires `ADMIN_API_TOKEN`. The S01 proxy forwards that server token only after verifying an administrator cookie on those routes. No S08-owned file is edited.
- The previous agent workspace scaffold stays untouched. No import, weather, model, forecast, or agent behavior is claimed as complete.

## Checks

| UTC | Check | Result |
|---|---|---|
| 09:07 | `npm ci --offline` | PASS: 374 packages installed, 0 vulnerabilities reported |
| 09:08 | `npm run typecheck`; `npm run lint` | PASS after dependency install |
| 09:09 | `npm run build` | PASS: app routes and proxy compiled |
| 09:10 | `npm run test:foundation` | PASS: 2 session/secret tests |
| 09:10 | `docker compose --env-file .env.example config` | PASS |
| 09:11 | `docker compose --env-file .env.example -p terra-s01-check up --build -d` | PASS: clean DB and app; migration applied |
| 09:11 | `GET /health` | PASS: 200 with database ready |
| 09:12 | HTTP auth/asset/tick smoke | PASS: anonymous assets/tick 401; bad login 401; admin login and list 200; invalid asset 400; create 201; authenticated tick 202 |
| 09:12 | repeat migrator; table counts | PASS: one migration record, 17 public tables including schema_migrations |
| 09:08 | `git fetch --all --prune` | BLOCKED: GitHub reports `Repository not found` |
| 09:19 | `npm run test:foundation`; `npm run lint`; `npm run typecheck` | PASS: 3 auth tests and static checks after secret hardening |
| 09:20 | fresh Compose build, migration, HTTP smoke with random test secrets | PASS: health 200, anonymous assets/tick 401, admin login/list 200, invalid asset 400, create 201, authenticated tick 202 |
| 09:15 | `git fetch origin`; `git push -u origin HEAD` | BLOCKED: GitHub reports `Repository not found`; no remote update |
| 09:26 | `npm run build`; `npm run lint`; `npm run test:foundation` | PASS: S08 auth bridge compiled and 3 foundation tests passed |

## Blockers and risks

- Remote repository access is unavailable. User will push; integrate S01 into local `main` and leave remote publication to the user. Do not claim remote completion until verified.
- The S00 data audit has not reached this branch; unknown physical/time parameters remain unconfirmed. Next action: reconcile after S00 handoff.
- Dispatcher tick intentionally has no job execution until S07 integration. Next action: wire its `JobStep` adapter after S07 interface lands.

## Next actions

1. Commit the S08 auth bridge, merge S01 through a private integration worktree into local `main`, then validate the local integration. The user will push.
2. Share S01 schema/type revision with S04 and the S00/S02/S03 owners; reconcile any validated data rules without inventing constants.
