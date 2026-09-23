# Project state — S03/S09 and industrial connectors

- Updated UTC: 2026-09-23 10:41Z.
- Branch/worktree: `chore/integrate-oracle-wincc` / private integration worktree.
- Base: `origin/main` at `0def4de`; task branch `origin/feat/oracle-wincc-connectors` at `c74b955`.
- Active task: merge validated Oracle/WinCC workflows with the latest S03/S09 main; final integration checks and main push pending.
- Demo: authenticated `/sources` runs explicitly synthetic Oracle history and WinCC live workflows end to end. API mode requires real server-side gateways and never falls back to fixtures.

## Integrated implementation

- S03 Open-Meteo Single Runs connector, cycle selection, provenance/raw-byte hashing, availability policy, 24/48-hour target validation and admissible saved fallback behavior are preserved.
- S09 deterministic CC0 smoke fixture, Makefile targets, fail-closed wrapper, acceptance matrix and clean-environment/backup procedure are preserved. Missing `demo:*` owner contracts still fail closed and are not product acceptance.
- Protected multilingual portal, sign-in, themes, S00/S01/S02/S04/S05/S06/S07/S08 code and prior documentation are preserved.
- Oracle: verify gateway access, discover tables/fields, map timestamp and normalized power to a turbine, then enable historical loading.
- Siemens WinCC: verify gateway access, discover tag groups, map power and wind-speed tags to a turbine, then enable live updates.
- `POST /api/v1/industrial-connectors/[kind]` validates test/discover/enable actions, keeps tokens server-side, rejects malformed responses and sanitizes failures.
- Connector UI copy is available in Russian, Kazakh and English and follows the portal theme/session architecture.

## Boundaries and risks

- Real Oracle/WinCC operation requires deployed gateways matching `docs/industrial-connectors.md` and the four documented URL/token variables. No plant endpoints or credentials were available.
- S03 persistence remains an injected in-memory port; PostgreSQL restart recovery and canonical S01 `WeatherRun` integration remain incomplete.
- Probe coordinates and source time/publication semantics remain unconfirmed. No MW/MWh or official forecast-quality claim is made; February actuals remain evaluation-only.
- Agent audit gaps, production tick/replay and remaining real S02/S03/UI payload alignment are unchanged.

## Validation

- PASS before integration: connector branch combined TypeScript suite 31/31, industrial/UI adapter suite 7/7, lint, typecheck and production build.
- PASS before integration: authenticated browser walkthrough reached “История загружается” for Oracle and “Обновления поступают” for WinCC; English localization verified.
- PASS on latest main before this merge: S03 weather tests 25/25, S09 harness 2/2, lint, typecheck and production build, as recorded by its integrator.
- EXPECTED BLOCKED: `node tests/acceptance/run.mjs verify` exits 2 until owners provide the missing `demo:verify` contract.
- NOT RUN: real Oracle, WinCC and PostgreSQL restart integrations because external endpoints/credentials are unavailable.

## Next actions

1. Run critical checks in this integration worktree, commit the merge, push `HEAD:main`, and verify task ancestry.
2. Configure real Oracle/WinCC gateways and repeat the two workflows against plant infrastructure.
3. Complete S03 persistence and remaining owner `demo:*` acceptance contracts.
