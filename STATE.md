# Project state — industrial portal task

- Updated UTC: 2026-09-23 10:15Z
- Branch/worktree: `feat/industrial-portal` / private `industrial-portal` worktree.
- Last verified base: `8895ba8` from `origin/main`; replaying validated task commit `7d04995` onto it. Only STATE.md conflicted; code changes are disjoint.
- Owner/status: Codex, industrial UI + RU/KK/EN + themes + mandatory sign-in; implementation and browser checks passed; combined-code validation and push pending.
- Demo: production preview on `http://localhost:3107/login`; random local administrator credentials live only in ignored `.env.local`. Sign in opens the requested dashboard route. Fixture forecast/import/report/journal flows work; real data API alignment remains a separate integration gate.

## Implemented and verified

- Industrial navigation, responsive dashboard, turbine illustration, 2-second skippable entrance, reduced-motion support.
- Russian default, Kazakh and English across four pages, login, forms, statuses and synthetic explanations. Locale-aware number/date display; Kazakh months handled explicitly for browsers with incomplete ICU data.
- Light/dark theme and language cookies applied by the server to initial HTML and retained across reloads.
- Existing signed administrator session now protects dashboard pages in proxy and server layout as well as APIs. Login/logout and live session checks use `/api/auth/session`; HttpOnly cookie, safe return-path allowlist, no client-only bypass or bundled password.
- Touched: `src/app`, `src/components`, `src/lib/i18n`, `src/lib/navigation.ts`, root login bridge, session GET, `proxy.ts`, `tests/ui`, this handoff. No forecasting/import/agent business logic changed.

## Preserved work and boundaries

- S00 data audit; S01 contracts/migrations/Compose/session/token bridge; S04 immutable as-of baseline; S05 fixtures/dashboard; S06 model training; S07 durable jobs/replay; S08 backtest/evaluation/export are retained from the base.
- S02 CSV import/connection/hourly-quality code, the verified HackAlem specification transcription, and the new agent-problems documentation are preserved from latest main. Prior S02 28 tests/lint/typecheck/build passed per its handoff; combined checks will be rerun here.
- Root `app/` is the effective router; root UI files re-export canonical `src/app` components.
- Source timezone/interval, physical units/normalization and target semantics remain unconfirmed. No MW/MWh or official quality claim. February actuals remain evaluation-only.
- Demo examples stay explicitly synthetic. Server-returned data retains its source language. Existing shared administrator role is reused; multi-user registration was not requested.

## Validation

- PASS: `npm run lint`, `npm run typecheck`, `npm run build` (production App Router build).
- PASS: `npm test` (6), `npm run test:foundation` (3), `npx tsx --test tests/backtest/*.test.ts` (13).
- PASS: `node --test tests/agent/workflow.test.cjs tests/forecast/service.test.cjs` (13).
- PASS: `node --test tests/ui/platform.test.cjs tests/ui/client.test.cjs tests/ui/csv.test.mjs` (10).
- PASS: `node tests/ui/dashboard.cjs` (13 browser scenarios, authenticated session; data API cases mocked).
- PASS: `node tests/ui/platform.cjs` (10 browser scenarios: actual login, redirects, Origin checks, defaults/persistence, English/Kazakh pages, mobile, logout, tampered/expired cookies, open-page expiry, reduced motion).
- PASS: visual review of light/dark login and Kazakh dark dashboard; no page overflow or browser exceptions. Browser locale review found ICU month fallback; fixed and unit-tested afterward.
- NOT_RUN: production PostgreSQL/data-source end-to-end flow; no database configured for this UI preview.

## Next actions

1. Run updated npm test/lint/typecheck/build and the UI suites after the S02 rebase; source adapters still need a separate real-API alignment.
2. Validate combined code, push task branch, merge in a private integration worktree and push `main` without rewriting history; record verified remote commits.
3. Separate follow-up: align S05 adapters with S02/S04/S08 real payloads, wire S07 tick and S03 weather; run real database/UI integration before operational use.
