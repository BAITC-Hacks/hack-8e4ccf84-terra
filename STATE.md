# Project state — all connector workspace

- Updated UTC: 2026-09-23 11:53Z.
- Branch: `chore/integrate-all-connectors`; latest main `ab2622c`; task `458ef18` verified on `origin/feat/all-connectors`. Integration commit `6546ace` verified on origin/main; task `458ef18` is its ancestor. Checks passed.
- Owner: Codex. User narrowed full redesign to connectors, then selected all five connector types.
- Demo: `http://localhost:3111/sources` in this integration worktree; auth remains required. Default synthetic mode is explicit.
- Implemented: reference-styled CSV/Weather/PostgreSQL-SCADA/Oracle/WinCC catalog; three gateway setup workflows; weather probe; canonical CSV request/report adapter; RU/EN/KK and both themes.
- Paths: connector UI/client/contracts, scoped CSS/i18n, industrial gateway contracts, weather probe/route, connector and UI tests, gateway docs and empty env templates. Other dashboard redesign was deferred and is not included.
- PASS: `npm test` (37); `node --test tests/ui/client.test.cjs tests/ui/platform.test.cjs` (8); `npm run lint`; `npm run typecheck`; `npm run build`.
- PASS: `node tests/ui/connectors.cjs` (4 groups, actual auth/validation/unconfigured routes plus fixture/canonical-wire browser checks); `node tests/ui/dashboard.cjs` (14 scenarios), Edge headless at port 3110. RU/EN/KK, light/dark, 390px layout, no runtime errors. Screenshots visually reviewed.
- PASS: authenticated real `POST /api/v1/connectors/weather` for coordinates 45/65 and UTC cycle 2026-01-01 00:00 returned HTTP 200, healthy, 120 hours. This is connectivity evidence, not approved asset coordinates or historical availability evidence.
- PASS: diff/secret review; credentials stay in ignored local env. No new dependencies.
- BLOCKED live industrial verification: no configured PostgreSQL/Oracle/WinCC gateways; each actual route safely returns `not_configured`. These are external gateway adapters, not bundled database/SCADA drivers.
- NOT RUN: full browser-to-PostgreSQL CSV persistence (no configured disposable DB; `docker` unavailable in this shell). Canonical CSV wire UI and existing import service tests pass.
- Constraint: Weather probe does not schedule or persist runs. CSV mapping is stored with imports, not a recurring schedule. Historical backend provenance/February blockers below remain.
- Integration preserves the concurrent overview redesign `e9dfb21`, already verified on origin/main at `ab2622c`; its previous remote blocker is resolved. Both scoped CSS blocks retained; overview implementation is unchanged. Added missing EN/KK overview catalog entries and adjusted the heading assertion to the merged design. PASS after integration: core 37, UI unit 8, lint, typecheck, production build, connector browser 4 groups and dashboard browser 14 at port 3111. Remote main push and ancestry verified. Next: configure real industrial gateways and a disposable database for live CSV persistence verification; retain historical weather/data provenance blockers below.

## Preserved overview handoff

- Overview hierarchy, derived KPIs, chart, alerts, onboarding and normalized units from e9dfb21 retained.
- Prior overview task reported typecheck/build/diff checks PASS; automated tests were skipped by that task instruction.

## Preserved backend handoff (historical validation)

- Updated UTC: 2026-09-23 11:21Z
- Branch/worktree: `chore/integrate-backend-spec-audit` / private integration worktree.
- Base/integration: backend-audit task `580fd3d` and merge `37a3a21` were integrated with the latest agent-remediation documentation; remote `main` reached `5ab785f` before this final handoff update.
- Owner/status: Codex; final checks pass, the task branch is remote, and `580fd3d` was verified as an ancestor of `origin/main`.

## Integrated implementation

- Preserved explicit development sign-in, the durable wind-agent runtime, and `docs/agent-subsystem-remediation-spec.md` from current `main`.
- Preserved the S03 Open-Meteo Single Runs connector and saved provenance evidence. Its local repository is not a production adapter for canonical PostgreSQL weather tables.
- CSV import now mirrors accepted training rows transactionally into canonical `observations`; evaluation-only targets remain isolated. Migration `0002_bridge_import_observations.sql` backfills existing accepted training rows.
- Forecast publication rejects any output unit other than `normalized`; weather without `published_at` is eligible only with an explicit availability assumption.
- Backtest leakage validation enforces `target_time = issued_at + lead_hour` exactly.
- Compose includes an application healthcheck. Detailed audit evidence and gaps are in `docs/backend-spec-audit.md`.

## Validation

- PASS on the audit branch and before latest-main merge: core (32), foundation (4), agent (12), replay (1), weather (25), forecast (7), acceptance harness (2), lint, typecheck, and production build.
- PASS before latest-main merge: Compose config/build/startup and application/database healthchecks; `/api/health` returned `database=ready`.
- PASS before latest-main merge: disposable PostgreSQL 16 migrations; CSV import produced three canonical observations and a persisted 24-point forecast; a separate clean database passed agent claim/fencing/checkpoint/restart integration.
- PASS after incorporating `cee93a6`: core (32), foundation (4), agent (12), replay (1), weather (25), forecast (7), acceptance harness (2), lint, typecheck, and production build.
- PASS after incorporating UI-prototype `b7fee06`: core (32), lint, typecheck, and hermetic Docker production build. A local build retry encountered a concurrently damaged `node_modules`; `npm ci` restored lint/typecheck and the clean container build passed.
- RESOLVED by the connector task: `Проверяем…` now has English/Kazakh translations; UI localization checks pass.
- EXPECTED BLOCKED: `node tests/acceptance/run.mjs verify` reports missing `demo:verify`; the fail-closed harness itself passes.
- BLOCKED by inputs/provenance: no February actuals, no provider-proven historical publication time, and unconfirmed turbine/time/power semantics.
- SKIP unless explicitly configured: live OpenAI smoke (`RUN_OPENAI_SMOKE=1` plus a verified model/key).

## Decisions and constraints

- Official specification v1.1 SHA-256: `6785661fbe95c0ee385b6740ca42cc6b2748e208c2802e9f34e7cfc9a6fb3974`.
- No actual/reanalysis weather may substitute for unavailable historical forecasts.
- Unknown publication time is not inferred from model run time; eligibility requires a recorded assumption.
- Only `data_use=training` is bridged into canonical observations.
- Only the persistence model currently has production inference support; unsupported artifacts fail explicitly.
- Candidate turbine coordinates from the PDF remain unconfirmed configuration.
- Development `test` credentials remain local-only and are not committed.

## UI/UX prototype

- Added 2026-09-23 11:25Z: `docs/design/terra-redesign.html` — standalone static HTML proposal for the dashboard (overview, forecast, sources, run log) with a demo/real data toggle. Synthetic data only; not wired into `src/` and not part of the build.

## Next actions

1. After owner data is available, confirm asset/time/power semantics and the historical weather availability policy.
2. Persist trustworthy archival forecast runs in canonical PostgreSQL and execute the February replay/evaluation.
3. Wire an approved trained artifact into production inference and add actual-arrival evaluation.
