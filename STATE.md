# Project state — minimal localized login hero integration

- Updated UTC: 2026-09-23T12:20:52Z.
- Branch/worktree: `chore/integrate-minimal-login-hero` / private integration worktree.
- Base/integration: latest fetched `origin/main` is `39b7418`; validated task `71da309`, prior integration `bfb6bbd`, and current remote chart/UX work are merged locally.
- Owner/status: Codex; task branch is pushed and latest-main integration checks pass. Normal `origin/main` push and ancestry verification remain.

## Minimal login hero (current task)

- Exact RU/KK/EN forecast heading and description replace the promotional copy; platform eyebrow, repeated captions, forced break, and accent-only line are removed.
- Heading is 600 at 40–48 px desktop and 28–32 px mobile; description is 16–17 px with normal contrast/leading. The existing system font, login controls, language/theme controls, and compact turbine illustration are preserved.
- Touched: `src/components/platform/login.tsx`, `src/app/globals.css`, `src/lib/i18n/messages.ts`, `tests/ui/platform.test.cjs`.
- PASS on task/latest-base build: core 42, UI/unit 9, lint, typecheck, production build (21 routes/pages), and diff review.
- PASS on production browser build: RU/KK/EN × light/dark at desktop 1440×900 and mobile 390×844; exact copy, no horizontal overflow, clipping, or hero/card overlap, and no browser warnings/errors. Screenshots are under ignored `.next/ui-qa` in the task worktree.
- No dependency, backend, business-logic, authentication, or persisted-data changes.
- PASS after latest-main merge: core 42, UI/unit 14, lint, typecheck, production build (21 routes/pages), and diff review. Login and chart/i18n changes auto-merged without code conflicts; `STATE.md` was reconciled manually.
- Next: commit the latest-main merge, push `main` normally, verify `71da309` ancestry, then record the remote main commit.

## Reference chart and UX fixes (preserved from origin/main)

- Task `5bddcb4`, integration `7b08fb0`, touch follow-up `3ee1708`, and state commit `39b7418` remain present from remote main.
- Forecast chart supports forecast/band, actual, previous version, target-hour tooltip/marker, mouse/touch/keyboard, gaps, bounds, and dark theme.
- Preserved UX fixes cover mobile drawer focus, English units, empty-source health messaging, unknown normalization, incomplete energy totals, and pinned touch selection after layout shifts.
- Remote handoff reports PASS: core 42, UI unit 13, lint, typecheck, build, platform/dashboard/connectors/history/chart/UX browser scenarios. Browser mocks do not resolve backend/data limitations.

## Historical viewer and integrated platform (preserved)

- Historical viewer `66421cf`: protected default `/history`, two demo turbines, Jan 31–Feb 28 issues, 24/48-hour views, graph/table, missing states, and canonical persisted-release reads. Day selection does not execute a full-period training/replay workflow.
- Connector workspace `458ef18`/`c89fbe8`: canonical CSV upload/report, weather probe, and PostgreSQL/Oracle/WinCC gateway adapters. Live industrial credentials and full browser-to-database CSV verification remain unavailable.
- Backend retains canonical observation bridging, normalized persistence forecasts, durable jobs, weather availability gates, and no-future-leakage checks.
- Root README, live overview hierarchy, and `docs/parallel-agent-completion-spec.md` remain preserved.

## Known blockers and backlog

- Official February evaluation remains blocked by absent February actuals, unproven historical weather publication times, and unconfirmed turbine/time/power semantics.
- Production trained-artifact inference and trustworthy archival weather persistence remain future work.
- `node tests/acceptance/run.mjs verify` remains expected-blocked until a `demo:verify` script is integrated.
- Live OpenAI smoke remains opt-in and was not run.
