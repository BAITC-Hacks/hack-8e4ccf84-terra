# Project state — UI/UX audit and reference chart

- Updated UTC: 2026-09-23 12:13Z; owner Codex; branch `test/ui-ux-audit`; verified base `66421cf`, changes uncommitted.
- Scope: user requested UI/UX testing, then matching the supplied chart screenshot/HTML. Preview `http://localhost:3112/forecast`; protected landing remains `/history`.
- Implemented: teal forecast and optional band, orange actual, dashed previous version, target-hour tooltip and marker; mouse/touch/keyboard support and dark theme. Missing hours/bounds stay missing. Only fixtures synthesize ranges; no MW or percent-of-rated inference.
- Reproduced and fixed: mobile drawer leaked keyboard focus; English overview retained Russian unit text; empty source list claimed healthy history; overview converted unknown normalization to percent of nominal. Incomplete horizons now have no complete energy total.
- Tests updated for current /history landing, username authentication and overview headings. Added chart and UX regression runners.
- PASS: `npm test` 42; `node --test tests/ui/client.test.cjs tests/ui/platform.test.cjs tests/ui/csv.test.mjs` 13; typecheck, lint, production build; diff and secret review.
- PASS: platform browser 10, dashboard browser 14, connector browser 4 groups; history browser scenario suite; chart pointer/keyboard/touch/bounds/gaps; UX 30 page-locale-theme-width combinations (320,390,768,1440px), modal focus, English copy, partial totals and empty-source assertions. No runtime exceptions. Production Edge headless; visual chart light/dark review.
- Latest chart CSS readability/mobile-tooltip refinement rebuilt and chart browser suite rechecked. Existing API/DB limitations are not resolved by browser contract mocks.
- Paths: shared chart, UI fixtures/contracts, overview/shell, CSS/i18n, tests/ui. No dependency changes or credentials committed.
- Next: commit/push task; integrate latest main in a private worktree, preserving parallel completion specification; verify remote/local main.

## Preserved project work and limitations

- Historical viewer `66421cf`: protected default /history, two demo turbines, Jan31–Feb28 issues, 24/48h, graph/table, missing states, canonical persisted-release reads. Selecting days does not execute full-period training/replay.
- Connector workspace `458ef18`/`c89fbe8`: CSV canonical upload/report, weather probe, PostgreSQL/Oracle/WinCC gateway adapters. Real weather probe previously returned 120 hours; industrial gateway credentials and full browser-to-DB CSV verification remain unavailable.
- Backend retains canonical observation bridge, persistence forecasts, durable jobs and no-future-leakage checks. February actuals, trusted historical weather publication, confirmed unit/time/asset semantics and production trained-artifact inference remain blockers.
- Latest fetched main `1923ce2` includes `docs/parallel-agent-completion-spec.md` (P1–P6 ownership and P7 acceptance); preserve that specification. Dispatch only when requested. Its prior remote access warning is not current: fetch succeeds in this environment.
