# Project state — S09 reproducibility integration

- Updated UTC: 2026-09-23 10:35Z
- Branch/worktree: local `main` target; verified S09 integration commit: `b226fb1`. This state update is pending its local-main fast-forward.
- Local base before integration: `main` at `11ed17b`; S09 source: `docs/s09-reproducibility` at `6302571`. Remote synchronization and push were intentionally not performed for this user-requested local-only integration.
- Owner/status: Codex. Industrial UI integration remains present; S09 reproducibility handoff is integrated on the local main history. Final product acceptance remains BLOCKED pending the owner implementations recorded in `docs/acceptance.md`.
- Demo: production preview on `http://localhost:3107/login`; random local administrator credentials live only in ignored `.env.local`. Sign in opens the requested dashboard route. Fixture forecast/import/report/journal flows work; real data API alignment remains a separate integration gate.

## Implemented and verified

- Industrial navigation, responsive dashboard, turbine illustration, 2-second skippable entrance, reduced-motion support.
- Russian default, Kazakh and English across four pages, login, forms, statuses and synthetic explanations. Locale-aware number/date display; Kazakh months handled explicitly for browsers with incomplete ICU data.
- Light/dark theme and language cookies applied by the server to initial HTML and retained across reloads.
- Existing signed administrator session now protects dashboard pages in proxy and server layout as well as APIs. Login/logout and live session checks use `/api/auth/session`; HttpOnly cookie, safe return-path allowlist, no client-only bypass or bundled password.
- Touched: `src/app`, `src/components`, `src/lib/i18n`, `src/lib/navigation.ts`, root login bridge, session GET, `proxy.ts`, `tests/ui`, this handoff. No forecasting/import/agent business logic changed.

## Preserved work and boundaries

- S00 data audit; S01 contracts/migrations/Compose/session/token bridge; S04 immutable as-of baseline; S05 fixtures/dashboard; S06 model training; S07 durable jobs/replay; S08 backtest/evaluation/export are retained from the base.
- S02 CSV import/connection/hourly-quality code, the verified HackAlem specification transcription, the latest specification/router cleanup, and `SLICE_RULE.md` are preserved from latest main. Combined S02/backtest/ML tests, foundation, UI/agent/forecast tests, lint, typecheck and production build passed after rebase.
- Root `app/` is the effective router; root UI files re-export canonical `src/app` components.
- Source timezone/interval, physical units/normalization and target semantics remain unconfirmed. No MW/MWh or official quality claim. February actuals remain evaluation-only.
- Demo examples stay explicitly synthetic. Server-returned data retains its source language. Existing shared administrator role is reused; multi-user registration was not requested.

- Agent audit `f436946` / integration `d2d4454` is preserved in `docs/agent-system-problems.md`: production agent wiring, automated tick and durable replay remain incomplete. Its PostgreSQL test was skipped without TEST_DATABASE_URL; this portal task does not claim those runtime gaps are fixed.
- S09 adds a deterministic CC0 synthetic 48-hour smoke fixture, Makefile targets, fail-closed command wrapper, acceptance matrix, and clean-environment/backup procedure. It does not assert model quality or successful AC-01–AC-16.

## Validation

- Previous industrial integration: PASS fresh npm ci, all 54 automated tests, lint, production build and typecheck. Runtime/UI files and dependencies exactly match the browser-tested task branch; additional main changes are documentation only.

- PASS: `npm run lint`, `npm run typecheck`, `npm run build` (production App Router build).
- PASS: `npm test` (28: S02/backtest/ML), `npm run test:foundation` (3).
- PASS: `node --test tests/agent/workflow.test.cjs tests/forecast/service.test.cjs` (13).
- PASS: `node --test tests/ui/platform.test.cjs tests/ui/client.test.cjs tests/ui/csv.test.mjs` (10).
- PASS: `node tests/ui/dashboard.cjs` (13 browser scenarios, authenticated session; data API cases mocked).
- PASS: `node tests/ui/platform.cjs` (10 browser scenarios: actual login, redirects, Origin checks, defaults/persistence, English/Kazakh pages, mobile, logout, tampered/expired cookies, open-page expiry, reduced motion).
- PASS: visual review of light/dark login and Kazakh dark dashboard; no page overflow or browser exceptions. Browser locale review found ICU month fallback; fixed, unit-tested and browser suite rerun afterward.
- NOT_RUN: production PostgreSQL/data-source end-to-end flow; no database configured for this UI preview.
- PASS: `node --test tests/acceptance/harness.test.mjs` (2 tests); `npm run lint`; `npm run typecheck`; `npm run build`.
- PASS (expected failure mode): `node tests/acceptance/run.mjs verify` exits 2 with `BLOCKED` because `demo:verify` is absent; it must not be treated as product acceptance.

## Next actions

1. Local `main` is the target of the pending fast-forward; do not treat this documentation merge as proof that AC-01–AC-16 pass.
2. Owners S01–S08 must supply the fixed `demo:*` CLI contracts and pass AC-01–AC-16, restore verification, and the clean Docker gate.
3. Align S05 adapters with S02/S04/S08 real payloads, wire S07 tick and S03 weather, and run a production database/UI integration before operational use.
