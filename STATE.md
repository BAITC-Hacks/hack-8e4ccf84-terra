# Project state — industrial connectors

- Updated UTC: 2026-09-23 10:39Z
- Branch/worktree: `feat/oracle-wincc-connectors` / task worktree rebased onto `origin/main` `11ed17b`.
- Last verified task commit: `6c7449a`; push and main integration pending.
- Owner/status: Codex, Oracle history and Siemens WinCC live connector workflows; implementation and post-rebase validation complete.
- Demo: authenticated `/sources` runs both explicitly synthetic fixture workflows end to end. API mode uses server-only gateway URLs/tokens and never falls back to fixtures.

## Implemented and verified

- Industrial navigation, responsive dashboard, turbine illustration, 2-second skippable entrance, reduced-motion support.
- Russian default, Kazakh and English across four pages, login, forms, statuses and synthetic explanations. Locale-aware number/date display; Kazakh months handled explicitly for browsers with incomplete ICU data.
- Light/dark theme and language cookies applied by the server to initial HTML and retained across reloads.
- Existing signed administrator session now protects dashboard pages in proxy and server layout as well as APIs. Login/logout and live session checks use `/api/auth/session`; HttpOnly cookie, safe return-path allowlist, no client-only bypass or bundled password.
- Oracle workflow: verify gateway access, discover tables/fields, map timestamp and normalized power to a turbine, enable historical loading.
- Siemens WinCC workflow: verify gateway access, discover tag groups, map power and wind-speed tags to a turbine, enable live updates.
- Protected `POST /api/v1/industrial-connectors/[kind]` validates test/discover/enable actions, keeps credentials server-side, rejects malformed gateway responses, and sanitizes failures.
- New connector UI copy is available in Russian, Kazakh and English and respects the integrated portal theme/session architecture.
- Touched: `src/app`, `src/components`, `src/lib/i18n`, `src/lib/navigation.ts`, root login bridge, session GET, `proxy.ts`, `tests/ui`, this handoff. No forecasting/import/agent business logic changed.

## Preserved work and boundaries

- S00 data audit; S01 contracts/migrations/Compose/session/token bridge; S04 immutable as-of baseline; S05 fixtures/dashboard; S06 model training; S07 durable jobs/replay; S08 backtest/evaluation/export are retained from the base.
- S02 CSV import/connection/hourly-quality code, the verified HackAlem specification transcription, the latest specification/router cleanup, and `SLICE_RULE.md` are preserved from latest main. Combined S02/backtest/ML tests, foundation, UI/agent/forecast tests, lint, typecheck and production build passed after rebase.
- Root `app/` is the effective router; root UI files re-export canonical `src/app` components.
- Source timezone/interval, physical units/normalization and target semantics remain unconfirmed. No MW/MWh or official quality claim. February actuals remain evaluation-only.
- Demo examples stay explicitly synthetic. Server-returned data retains its source language. Existing shared administrator role is reused; multi-user registration was not requested.
- Real Oracle/WinCC operation requires deployed HTTP gateways matching `docs/industrial-connectors.md` plus configured URL/token environment variables; no real plant endpoints were available for this task.

- Agent audit `f436946` / integration `d2d4454` is preserved in `docs/agent-system-problems.md`: production agent wiring, automated tick and durable replay remain incomplete. Its PostgreSQL test was skipped without TEST_DATABASE_URL; this portal task does not claim those runtime gaps are fixed.

## Validation

- Integration worktree: PASS fresh npm ci, all 54 automated tests, lint, production build and typecheck. Runtime/UI files and dependencies exactly match the browser-tested task branch; additional main changes are documentation only.

- PASS: `npm run lint`, `npm run typecheck`, `npm run build` (production App Router build).
- PASS: `npm test` (28: S02/backtest/ML), `npm run test:foundation` (3).
- PASS: `node --test tests/agent/workflow.test.cjs tests/forecast/service.test.cjs` (13).
- PASS: `node --test tests/ui/platform.test.cjs tests/ui/client.test.cjs tests/ui/csv.test.mjs` (10).
- PASS: `node tests/ui/dashboard.cjs` (13 browser scenarios, authenticated session; data API cases mocked).
- PASS: `node tests/ui/platform.cjs` (10 browser scenarios: actual login, redirects, Origin checks, defaults/persistence, English/Kazakh pages, mobile, logout, tampered/expired cookies, open-page expiry, reduced motion).
- PASS: visual review of light/dark login and Kazakh dark dashboard; no page overflow or browser exceptions. Browser locale review found ICU month fallback; fixed, unit-tested and browser suite rerun afterward.
- NOT_RUN: production PostgreSQL/data-source end-to-end flow; no database configured for this UI preview.
- PASS after rebase: combined TypeScript suite 31/31, industrial/UI adapter suite 7/7, lint, typecheck, production build.
- PASS after rebase: authenticated browser walkthrough for Oracle and WinCC end states; English localization also verified.
- NOT_RUN: real Oracle database and Siemens WinCC plant connections; gateway endpoints and credentials were not provided.

## Next actions

1. Push `feat/oracle-wincc-connectors`, integrate it into the latest `origin/main`, rerun critical checks, and verify ancestry.
2. Configure production Oracle/WinCC gateway URLs and tokens, then repeat the two workflows against plant infrastructure.
3. Continue agent audit and remaining real data/API integration work described above.
