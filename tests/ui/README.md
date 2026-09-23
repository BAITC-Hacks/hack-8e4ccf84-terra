# S05 UI verification and adapter handoff

## Run

- `npm ci --no-audit --no-fund`
- `npm run lint`
- `npm run build` (includes TypeScript)
- `node --test tests/ui/csv.test.mjs tests/ui/client.test.cjs`
- `npm run start -- --port 3105`
- In another shell: `node tests/ui/dashboard.cjs`. Requires Playwright supplied by the runner; no production dependency added. Set `NODE_PATH` to an existing installation if needed. Set `UI_BROWSER_CHANNEL=msedge` to use installed Edge, or leave unset for Playwright Chromium. Override URL with `UI_BASE_URL`.

Screenshots are saved under ignored `.next/ui-qa/`. The script tests the production build at desktop and mobile sizes, all resource states, version/horizon/mode/timezone changes, full-version export, CSV validation/confirmation/report, agent-result navigation, failed-refresh retention, N=0, multipart imports and asynchronous jobs. API cases are **mocked**, not a claim of completed E4 integration.

## Pending S01 integration

`src/components/dashboard/contracts.ts` is a UI-local schema proposal from PLAN §6/8. S01 server contracts did not exist on the base. All wire details are isolated in `client.ts`; fixtures are synthetic and never loaded as fallback after an API failure. Do not import server-only code into the UI.

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
