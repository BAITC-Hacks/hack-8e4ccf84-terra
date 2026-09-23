# Project state

## Snapshot
- Updated UTC: 2026-09-23 09:26Z. Branch/worktree: `chore/integrate-s05-dashboard`, `C:/Users/Kassym/Desktop/TTT/hack-8e4ccf84-terra-worktrees/integrate-s05-dashboard`.
- Verified base: `origin/main` at `a29854c`; UI implementation `f1519cc`; verified task commit `f3299ee`; remote branch handoff `5a004ae`. Verified main integration `ed439af5fa935c648dbf258c411e8037eb94f345` contains S05 and concurrent S08. This state-only edit records the verified remote result.
- S05 owner: Codex / Касымжан. Status: PUSHED and integrated into origin/main at `ed439af`; validated on fixture/mock API; real E4 integration remains BLOCKED on S01–S04.
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
- Existing foundation `src/agent`, `src/db`, `src/domain/demo`, `src/ui` untouched; runtime completeness UNKNOWN. S01–S04 and S07 are not present on inspected main. S08 is now integrated; its production seams still await S04/S07.

## Verification in the clean integration worktree
- PASS `npm ci --no-audit --no-fund`. Initial retry encountered Windows file lock from our preview; stopped it and clean install succeeded.
- PASS `npm test`: 6 ML tests.
- PASS `node --test tests/ui/csv.test.mjs tests/ui/client.test.cjs`: 6 tests.
- PASS `npm run lint` and `npm run build`: TypeScript, four UI routes plus S06 training and three S08 API routes.
- PASS `UI_BROWSER_CHANNEL=msedge node tests/ui/dashboard.cjs` with runner Playwright via NODE_PATH, production port 3106: 13 scenarios; fixture + mock API; 1440px desktop and 390px mobile; screenshots reviewed, no runtime errors.
- PASS missing real `/api/v1/assets`/forecasts return honest errors. Successful real E4 API flow NOT_RUN (dependent handlers absent).
- PASS staged diff/whitespace/secret review; no credentials; `git diff --exit-code origin/main -- src/server src/app/api app/api package.json package-lock.json`.

## Next actions
1. Verified remote feature branch at `5a004ae4a7d7e0a8d4b6f2591e11241eb4cecc94`; integration diff preserves all S00/S06 commits and files.
2. Main push verified by git ls-remote at `ed439af`; `git merge-base --is-ancestor f3299ee origin/main` passed. No deployment performed.
3. S01–S04 owners publish contracts/API; align UI adapter and execute real E4 gate in tests/ui/README.md. S06 also awaits canonical data and bounded S07 execution.
## S08 preserved during concurrent integration
- Remote main advanced to `a29854c` while S05 was validating; first normal push was rejected (non-fast-forward). S08 implementation `5ce6748`, integration `ed2ddf6`, handoff `a29854c` are incorporated with no changes to their files.
- S08 sequential runner injects the production forecast service, isolates evaluator-only actuals, checks temporal leakage/rerun tolerance, provides February metrics overall/by asset/by lead/common-pair baseline and FR-10 CSV; March tails are exportable but excluded from February metrics.
- Its in-memory registry is an integration adapter, not durable production storage. Canonical POST backtest, evaluation and export routes plus root bridges are preserved. S01/S07 must provide shared session/persistence/queue integration.
- S05's wire proposal was built before S08 publication. S08 currently has bearer authentication, issue_times/training_cutoff requests and evaluation envelope; UI adapter alignment remains part of the real E4/S01 gate, not a successful integration claim. No secret is embedded or added to the browser.
- PASS combined 13 backtest tests (`npx --no-install tsx --test tests/backtest/*.test.ts`), 6 ML tests, 6 UI unit tests, lint/build and 13 browser scenarios on production port 3106 before retrying main push. All four API routes and four UI routes generated.

Remote result: feature branch 5a004ae, main integration d439af. All implementation and shared-state reconciliation are committed; both worktrees are retained for review. After this handoff commit, verify its normal push too.

## Local S01 and S07 integration (not pushed)
- 2026-09-23 09:28 UTC: this integration branch merges S01 commits `49fda2d`, `848bef1`, `bebdcef` and S07 implementation `564a09e` through `bf4f1fd` into the current local main (`1a91e23` at merge start). The user will push the resulting local main.
- S01 adds PostgreSQL schema/migrator, administrator sessions, protected `/api/v1/*`, separately protected `/api/internal/jobs/tick`, health and assets API. The tick handler remains an authenticated idle adapter.
- S07 adds fixture and PostgreSQL job stores with atomic claim, fenced lease/heartbeat/checkpoint, bounded retry, idempotent input trigger, agent decisions, replay and template explanation after LLM failure. The dispatcher only calls the internal tick endpoint.
- S07 fixture tests: 7 PASS; local PostgreSQL 16 adapter test: 1 PASS; S01 foundation tests: 3 PASS. Before this merge, the S01+S07+S06+S08 tree passed 10 combined agent/foundation tests, lint and canonical `npm run build`. No checks were run after merging S05 because the user asked for no additional tests.
- Outstanding: S07 tick execution and real S02–S06 service wiring are not present; S04 publication is still in a separate worktree. Do not claim an end-to-end automatic forecast from this merge. S00 unknown source parameters remain unresolved.
- Next action after the user pushes: connect the S04 publication service and canonical input adapters, then validate protected tick and one replay issuance without double publication.
