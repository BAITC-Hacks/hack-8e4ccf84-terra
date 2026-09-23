# Project state — S05 task branch

## Snapshot
- Updated UTC: 2026-09-23 09:14Z; branch `feat/s05-dashboard`; owner S05/Codex for Касымжан.
- Verified base `c2b4003`; refreshed origin/main `68e0714` includes S00 audit, S06 ML implementation and updated integration policy. Pending implementation: uncommitted.
- Status: VALIDATED on fixture/mock API; real E4 integration BLOCKED on S01–S04 publication.
- Demo: `npm run dev`, open `/overview`; `/forecast`, `/sources`, `/agent-log`. Default is visibly synthetic backtest data; switch “Настоящий API” for same-origin `/api/v1`.

## Verified result
- Four Russian pages; forecast graph/table, asset/release/horizon filters, previous-version alignment by target time, briefing, full-version CSV, source freshness/coverage and provenance.
- Explicit live/backtest/replay, display timezone, normalized original scale. No MW/MWh or percent-of-rated conversion. Loading/empty/error/stale/partial states; refresh failure retains last successful forecast with warning.
- CSV file preview, mapping, encoding/delimiter/decimal/source timezone/interval convention, confirmation invalidation, multipart import and job/report flow; report lookup and row/reason CSV.
- Agent tool/reason/duration/error/result journal; job polling; forecast/backtest request; evaluation lookup with N=0 displayed as no data.
- API responses validated; auth/network/malformed responses fail visibly without fixture fallback. UI-local proposal pending S01: `src/components/dashboard/contracts.ts` / `client.ts`.
- Changed paths: `src/app`, `src/components/dashboard`, `tests/ui`, `docs/handoffs/kassym-s05.md`, this handoff. Starter root `app/` moved because it shadows `src/app`; no server slice/config/dependency changes.

## Checks
- PASS `npm ci --no-audit --no-fund` (no dependency file changes).
- PASS `npm run lint`.
- PASS `npm run build` (Next 16.3.6, TypeScript, all four routes).
- PASS `node --test tests/ui/csv.test.mjs tests/ui/client.test.cjs`: 6 tests.
- PASS `UI_BROWSER_CHANNEL=msedge node tests/ui/dashboard.cjs` with runner Playwright via NODE_PATH against production on port 3105: 13 scenarios (fixture + mocked API); desktop/mobile screenshots reviewed. Commands for Windows documented in tests/ui/README.md.
- PASS actual missing `/api/v1` shows unavailable errors without synthetic fallback. Real successful API flow NOT_RUN; no handlers exist on inspected base.
- PASS staged diff/secret review; no credentials or unrelated dependency/server changes. Refreshed-base verification pending.

## Preserved project constraints / other work
- S00 artifacts on origin/main: `docs/data-audit.md`, `docs/data-contract.md`; audit commit `716c63b`. Read and respected. Two separate source series; unknown normalization/physical target/timezone/interval meaning/availability. CSV has no February actuals. Do not merge source powers or manufacture performance metrics.
- S01 owns contracts/DB/auth/config, S02 imports, S03 weather, S04 forecast, S06–S08 downstream calculation/agent/evaluation. Their implementation status remains UNKNOWN until merged; UI does not edit their files.
- Existing foundation in src/agent, src/db, src/domain/demo, src/ui remains untouched; runtime completeness UNKNOWN.

## Next actions
1. Review and commit S05, rebase onto refreshed origin/main, reconcile S00 STATE facts; rerun relevant checks and push task branch.
2. Follow updated AGENTS standing instruction: merge in separate integration worktree, validate and fast-forward-push main; verify task ancestry and remote state.
3. Owners publish S01–S04; align UI-local adapter and run real E4 acceptance described in tests/ui/README.md. Real API validation remains open.
## Reconciled S06 integration
- S06 / E5 is already integrated on origin/main: implementation `d094908`, integration `8a7d746`, handoff `68e0714`.
- Preserved nonlinear ridge/train-only scaling/checkpoints, empirical power curve, pre-February rolling validation, fair comparison and durable training-job enqueue. S06 reported 6 passing tests, lint/build and queued HTTP 202; this branch will rerun its automated checks after integration.
- Canonical route `src/app/api/v1/training-jobs` and S06 root runtime adapter `app/api/v1/training-jobs` remain untouched. Root app must remain active: add thin UI-only re-exports to src/app rather than remove another slice's API adapter.
- S06 artifacts use ignored `.data/ml` / ML_ARTIFACT_DIR. S01/S07 must connect bounded advance to protected tick with leases; no dispatcher execution or real-model-quality claim is implied.
- S00 unknown time/target/availability semantics and missing February actuals remain blockers for real E4/evaluation.
