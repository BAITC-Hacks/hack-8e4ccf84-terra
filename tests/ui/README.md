# S05 UI verification and adapter handoff

## Historical scenario

`/` and default sign-in now open `/history`. Select a turbine, an inclusive UTC issue-date range
within 31 January–28 February 2026, and a 24/48-hour horizon. Select any day or use previous/next
to inspect its saved releases in a graph or table. Forecast target hours can extend into March;
the official evaluation window remains February. This screen does not enqueue calculations.

Demo mode has two explicitly synthetic turbines and 29 daily releases, without invented actuals.
Real mode reads canonical `{assets}` and `{forecasts}` envelopes for turbines and saved
backtest/replay releases. It preserves missing hours, distinguishes incomplete publications,
and warns when the API's 100-release-per-query limit may have truncated the list. API errors
never switch to demo data. Automatic full-period execution remains a separate backend task.

- `npx tsx --test tests/ui/history.test.ts`: date boundaries, units, gaps, canonical adapter, authentication return path.
- After `npm run build`, run `node tests/ui/history.cjs` with runner-provided Playwright in `NODE_PATH`.
  This starts and stops its own production server on port 3136 (override `HISTORY_UI_PORT`),
  uses ephemeral credentials, and checks real authentication plus mocked data API responses.
  Set `UI_BROWSER_CHANNEL` to override the default installed Edge browser.
  Desktop/mobile/dark screenshots are written under ignored `.next/ui-qa/`.

The older `dashboard.cjs` / `platform.cjs` scripts contain pre-redesign overview/default-route
expectations; the historical browser suite is the current focused check for this scenario.

## Run

- `npm ci --no-audit --no-fund`
- `npm run lint`
- `npm run build` (includes TypeScript)
- `node --test tests/ui/csv.test.mjs tests/ui/client.test.cjs`
- `npm run start -- --port 3105`
- In another shell: `node tests/ui/dashboard.cjs`. Requires Playwright supplied by the runner; no production dependency added. Set `NODE_PATH` to an existing installation if needed. Set `UI_BROWSER_CHANNEL=msedge` to use installed Edge, or leave unset for Playwright Chromium. Override URL with `UI_BASE_URL`.

Screenshots are saved under ignored `.next/ui-qa/`. The script tests the production build at desktop and mobile sizes, all resource states, version/horizon/mode/timezone changes, full-version export, CSV validation/confirmation/report, agent-result navigation, failed-refresh retention, N=0, multipart imports and asynchronous jobs. API cases are **mocked**, not a claim of completed E4 integration.

## Real API alignment gate (still open)

`src/components/dashboard/contracts.ts` is the original UI-local schema proposal from PLAN §6/8. S01/S02/S04/S08 server routes now exist, but their payloads still need alignment with this UI adapter. All wire details are isolated in `client.ts`; fixtures are synthetic and never loaded as fallback after an API failure. Do not import server-only code into the UI.

Proposed read responses (bare JSON, no envelope):

| Route under `/api/v1` | UI schema |
| --- | --- |
| GET `/assets` | `Asset[]` |
| GET `/forecasts?mode=live\|backtest\|replay` | `Forecast[]`, including points; local asset/version/horizon filtering |
| GET `/connections` | `Connection[]` |
| GET `/imports/{id}` | `ImportReport` |
| GET `/evaluations/{id}` | `Evaluation` |
| GET `/agent-runs/{id}` | `AgentRun` |
| GET `/jobs/{id}` | `Job`; polling every 2.5s until terminal state, stops on errors |
| GET `/forecasts/{id}/export` | `text/csv`, complete immutable version, UTC |

POST `/imports`: multipart `file`, JSON-string `mapping` (timestamp/wind_speed/power/temperature → original CSV header), JSON-string `options` (asset_id, encoding, delimiter, decimal_separator, timestamp_format, timezone, timestamp_convention, units). Responses: 202 `{job_id}`; completed job `result_id` opens the report.

POST `/forecast-jobs` or `/backtest-jobs`: JSON `{asset_ids, issued_at, horizon_hours, mode, model_version, data_policy:'history_only'}` from PLAN. UTC issue input is labeled explicitly. Backtest schedule remains server configuration. Response: 202 `{job_id}`. All POST requests send `Idempotency-Key`; browser session uses same-origin credentials. The UI does not call internal tick or manage server auth.

Known integration questions: S01 response envelopes, IDs, canonical unit enum and mapping fields; S02 multipart options, full rejected-row artifact URL (current UI exports reported row/reason pairs only); S04 list pagination/detail shape; S07 run discovery; S08 evaluation breakdowns/export contract. Align this adapter with published types before declaring real API validation.

## Data constraints

S00 audit: original normalized power scale has unknown denominator; no MW/MWh or percent-of-rated conversion. Fixture target is explicitly synthetic, not an aggregation of either source. Source timezone and interval convention have no inferred defaults in import. February actuals remain evaluation-only; fixtures show invented actuals and metrics, never measured performance. CSV preview is bounded to 256 KiB / five data rows; server validates the full original file.

## Real API E4 gate (not yet run)

With S01–S04 and an authenticated development session: choose “Настоящий API”, verify assets/connections, upload each original CSV with confirmed semantics, follow the job/report, run a forecast, compare two persisted versions and export. Repeat refresh failure, empty result, partial data and stale data. Check immutable IDs/units/timestamps against DB/API. S07/S08 routes may remain unavailable until their own slices land; UI must show errors honestly.

Router integration: root app remains active for S06 API compatibility. Root UI routes only re-export src/app pages/layout; src/app owns UI implementation. S01 can consolidate these adapters later. S06 API files are unchanged.

## Industrial portal: authentication, languages and themes

`/login` is the public entrance. Russian and the light theme are the defaults. English/Kazakh and theme preferences are saved in non-sensitive cookies and applied to the initial server HTML. The two-second wind-turbine entrance can be skipped; reduced-motion preferences disable rotation. It appears on a full page load, not every client-side navigation.

Dashboard pages are protected by the existing signed, HttpOnly, SameSite=Strict administrator session on the server (proxy and layout). There is no browser-only authentication or demo bypass. Configure `ADMIN_PASSWORD` (12+ characters) and `SESSION_SECRET` (32+ characters) in an ignored `.env.local` or deployment secrets. Use distinct random values; there is no bundled default password. `ADMIN_API_TOKEN` remains server-only for the existing S08 bridge. HTTPS sets the session cookie Secure. The existing shared administrator role is retained; account registration and multi-user roles are outside this task.

Additional validation:

- `node --test tests/ui/platform.test.cjs tests/ui/client.test.cjs tests/ui/csv.test.mjs`
- `node tests/ui/platform.cjs` against the production server (default port 3107; `UI_BASE_URL` overrides it).
- Both browser scripts load an ignored `.env.local` if present, or accept `ADMIN_PASSWORD` from the environment. The platform suite also uses `SESSION_SECRET` to test an actually expired signature. Never log or commit those values.
- `platform.cjs` tests real authentication, protected pages/APIs, wrong credentials, Origin checks, language/theme persistence, all translated pages, mobile navigation, logout, forged/expired sessions and reduced motion.
- `dashboard.cjs` tests the existing 13 dashboard flows after a real sign-in. Forecast/import API responses in its contract scenarios remain mocked. This does not claim real S02–S04 end-to-end integration.

All interface copy and synthetic fixture explanations are translated. Data returned by a real server retains its source language. Numerical values, identifiers, units and timestamps are preserved; labels and display dates/numbers follow the selected locale.

## UI/UX audit and reference chart (2026-09-23)

- `node tests/ui/ux.cjs`: keyboard modal navigation, 30 page/locale/theme/viewport combinations (320–1440px), no page overflow, English-copy checks, honest normalized units, incomplete totals and empty source status.
- `node tests/ui/chart.cjs`: pointer/touch/keyboard tooltip, previous version, fact, optional interval, dark palette, missing-hour gaps and API without interval bounds.
- Browser suites use `UI_BASE_URL`, `UI_BROWSER_CHANNEL` and local ignored auth settings as above; the history suite owns a separate ephemeral server.
- Point `interval?: [lower, upper] | null` is an optional UI wire extension. Bounds must be finite and ordered. Existing API responses remain compatible and render no band if bounds are absent.
- Only explicit fixture generators create synthetic bands; this is a visual example, not a calibrated confidence interval. API intervals are never inferred. MW and percent-of-rated conversions remain unavailable until asset scale is verified.
- The reference chart supports focus + Left/Right/Home/End, Escape dismissal, pointer hover and touch. Table view remains available.
