# Project state — S03/S09 and industrial connectors

- Updated UTC: 2026-09-23 10:51Z.
- Branch/worktree: `chore/integrate-oracle-wincc` / private integration worktree.
- Base: `origin/main` at `0def4de`; task branch `origin/feat/oracle-wincc-connectors` at `c74b955`.
- Last verified integration: `origin/main` at `1e9c688`; task commits `6c7449a` and `c74b955` are verified ancestors.
- Active task: Oracle/WinCC workflows are integrated and pushed to `origin/main`; real plant validation awaits gateway endpoints and credentials.
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

- PASS after integration: combined TypeScript suite 31/31, industrial/UI adapter suite 7/7, S03 weather tests 25/25, S09 harness 2/2, lint, typecheck and production build.
- PASS before integration: authenticated browser walkthrough reached “История загружается” for Oracle and “Обновления поступают” for WinCC; English localization verified.
- EXPECTED BLOCKED: `node tests/acceptance/run.mjs verify` exits 2 until owners provide the missing `demo:verify` contract.
- NOT RUN: real Oracle, WinCC and PostgreSQL restart integrations because external endpoints/credentials are unavailable.

## Next actions

1. Configure real Oracle/WinCC gateways and repeat the two workflows against plant infrastructure.
2. Complete S03 persistence and remaining owner `demo:*` acceptance contracts.
