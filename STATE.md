# Project state

## Snapshot
- Updated UTC: 2026-09-23 09:23Z. Branch/worktree: `chore/integrate-s05-dashboard`, `C:/Users/Kassym/Desktop/TTT/hack-8e4ccf84-terra-worktrees/integrate-s05-dashboard`.
- Verified base: `origin/main` at `68e0714`; UI implementation `f1519cc`; verified task commit `f3299ee`; remote branch handoff `5a004ae`. Integration merge pending commit.
- S05 owner: Codex / Касымжан. Status: PUSHED to origin/feat/s05-dashboard; validated on fixture/mock API; real E4 integration remains BLOCKED on S01–S04.
- Demo: `npm run dev`, `/overview`, `/forecast`, `/sources`, `/agent-log`. Default visibly synthetic backtest; select “Настоящий API” for same-origin `/api/v1`.

## S05 verified result
- Russian overview/forecast/sources/agent log. Chart/table, asset/version/24–48h filters, previous version by target time, briefing, full-version CSV, provenance and source freshness/coverage.
- Explicit live/backtest/replay, timezone and original normalized power scale. Loading/empty/error/stale/partial states; failed refresh retains last successful forecast. Missing hours remain chart gaps.
- CSV bounded preview, mapping, encoding/delimiter/decimal/source timezone/interval convention and explicit confirmation, multipart import, job/report flow and row/reason CSV.
- Agent tools/reasons/duration/errors/result links; job polling; forecast/backtest request and evaluation report with N=0 shown as no data.
- Schema-checked API adapter fails visibly without fixture fallback. UI-local contract is provisional, pending S01. Details and actual API gate: `tests/ui/README.md`, `docs/handoffs/kassym-s05.md`.
- UI implementation in `src/app` and `src/components/dashboard`. Root UI routes are thin re-exports to retain S06's existing root API adapter; no S06/API/server/config/dependency files changed by S05.

## Preserved integrated work
- S00 audit `716c63b`, merged through `f7d1ed9`: `docs/data-contract.md` and `docs/data-audit.md` remain authoritative. Two separate source series; normalization/physical target/source timezone/interval meaning/availability UNKNOWN; no February actuals. Do not aggregate source powers or claim measured performance from fixtures.
- S06 implementation `d094908`, integration `8a7d746`, remote handoff `68e0714`: ridge features/train-only scaling/resumable checkpoints, empirical power curve, pre-February rolling validation and fair comparison, JSON artifacts and durable training-job enqueue are preserved.
- Both S06 route files remain untouched. Build exposes `/api/v1/training-jobs`; artifacts use `.data/ml` / ML_ARTIFACT_DIR. S01/S07 must supply protected tick/lease orchestration. Real ML quality and dispatcher execution remain unverified.
- Existing foundation `src/agent`, `src/db`, `src/domain/demo`, `src/ui` untouched; runtime completeness UNKNOWN. S01–S04 and S07–S08 implementation not present on inspected main (except S06); no completeness claims.

## Verification in the clean integration worktree
- PASS `npm ci --no-audit --no-fund`. Initial retry encountered Windows file lock from our preview; stopped it and clean install succeeded.
- PASS `npm test`: 6 ML tests.
- PASS `node --test tests/ui/csv.test.mjs tests/ui/client.test.cjs`: 6 tests.
- PASS `npm run lint` and `npm run build`: TypeScript, four UI routes plus S06 training route.
- PASS `UI_BROWSER_CHANNEL=msedge node tests/ui/dashboard.cjs` with runner Playwright via NODE_PATH, production port 3106: 13 scenarios; fixture + mock API; 1440px desktop and 390px mobile; screenshots reviewed, no runtime errors.
- PASS missing real `/api/v1/assets`/forecasts return honest errors. Successful real E4 API flow NOT_RUN (dependent handlers absent).
- PASS staged diff/whitespace/secret review; no credentials; `git diff --exit-code origin/main -- src/server src/app/api app/api package.json package-lock.json`.

## Next actions
1. Verified remote feature branch at `5a004ae4a7d7e0a8d4b6f2591e11241eb4cecc94`; integration diff preserves all S00/S06 commits and files.
2. Clean integration worktree checks passed; commit merge, normal fast-forward push to main, verify task ancestry and record remote result.
3. S01–S04 owners publish contracts/API; align UI adapter and execute real E4 gate in tests/ui/README.md. S06 also awaits canonical data and bounded S07 execution.
