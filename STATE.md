# Project state

## Snapshot

- Updated UTC: 2026-09-23T09:01:00Z.
- Branch/worktree: `feat/s03-weather-runs`, `C:/Users/Kassym/Desktop/TTT/hack-8e4ccf84-terra-worktrees/s03-weather`.
- Last verified base: `0d251d6` (`origin/main`); implementation: `7ba273e`.
- Verified remote push: `origin/feat/s03-weather-runs` = `7ba273ec803822a80c1f40cd8f002b711485941a` (ls-remote matches HEAD).
- Pending changes: documentation handoff only, `uncommitted`; implementation milestone PUSHED.
- Main integration BLOCKED: SLICES.md requires published S01 contracts before combining dependent slices; full S03 is not completed.
- Remote access: fetch and fast-forward base synchronization PASS. Previous access blocker is stale.
- Demo: `npm run dev` still serves the starter page; no weather UI/API is wired.
- Existing agent foundation is tracked on the base; its database/OpenAI workflow remains NOT_RUN.

## Active work

- S03 / Codex: independent connector VALIDATED, full slice BLOCKED by unpublished S00/S01.
- Acceptance implemented: exact Single Runs fetch; candidate cycles; raw bytes/SHA-256 and
  provenance; explicit availability assumption or observed download time; available_at <= T;
  exactly 24/48 complete target hours; admissible saved fallback or explicit error.
- Touched: `docs/weather-verification.md`, `src/server/connectors/weather/**`,
  `src/server/data/weather/**`, `tests/weather/**`, this handoff and `docs/handoffs/kassymzhan-s03.md`.
- Persistence is an injected S03-local port. Only tests have an in-memory implementation.
  PostgreSQL persistence/restart recovery and canonical S01 integration are NOT implemented.
- Other slices are not claimed complete. S00 has a separate local worktree; its results are
  not on this branch or the fetched base. S01 contracts and weather tables are absent.

## Verified decisions / evidence

- Five live probes saved with raw bodies and SHA-256 under `tests/weather/evidence/`.
  Three Jan/Feb 2026 ECMWF runs cover both 24/48 hours at the test coordinate.
  March 2023 run returns HTTP 400. temperature_80m returns HTTP 200 with all null values.
- Coordinates 43.25, 76.95 are only a probe location, not the confirmed station.
- Historical publication timestamp is UNKNOWN. No default assumed delay; tests use 12 h
  with an explicitly test-only approval reference. Production method approval is outstanding.
- Targets currently mean T+1h through T+Nh, with hourly UTC T. S01 must confirm convention.
- Single Runs only: never substitute actual future weather, reanalysis or stitched history.
- Tests compare availability policy semantically, independent of PostgreSQL JSONB key ordering.

## Validation (2026-09-23 UTC)

| Command / scenario | Result | Evidence |
|---|---|---|
| `npm ci` | PASS | Lockfile unchanged; dependencies installed |
| `node tests/weather/probe.mjs tests/weather/evidence` | PASS | Five HTTP results with recorded URLs and hashes; limitations above |
| `node --test tests/weather/weather.test.mjs` | PASS | 25 tests, no network required |
| `npm run lint` | PASS | No errors after converting test runner to ESM |
| `npm run build` | PASS | Next production build and TypeScript pass; starter routes only |
| `npx tsc --noEmit` after build | PASS | Exit 0 |
| Initial typecheck before first build | FAIL, resolved | Existing LayoutProps missing until Next generates types |
| PostgreSQL write/read/restart integration | BLOCKED | S01 schema/contracts/adapter absent |
| Whole-month archive and actual station coverage | NOT_RUN | S00 coordinates and approved issue schedule unavailable |

## Next actions

1. Publish S00/S01; map the local port to WeatherRun/WeatherRunReader and implement atomic,
   immutable persistence through the S01 owner. Verify saved fallback after PostgreSQL restart.
2. Confirm station/time convention and approve documented conservative publication delay;
   run probe on the actual coordinates and all required February cycles.
3. Run `node --test tests/weather/weather.test.mjs`, `npm run lint`, `npm run build`,
   `npx tsc --noEmit`, then integrate with S04 at one shared issue time.

## Tangible milestone

2026-09-23: real archive probe artifacts, connector/selection implementation and 25 passing
behavior tests pushed from isolated worktree as `7ba273e`. Rebased over instruction-only main updates; 25 tests rerun PASS. Full S03 remains blocked, not end-to-end complete.
