# Project state — forecast KPI cards

- Updated UTC: 2026-09-23T12:33:00Z.
- Branch/worktree: `chore/integrate-forecast-kpi-cards` / private integration worktree.
- Owner/status: Codex; task commit `95a413f` is pushed and merged with latest `origin/main` at `f887e9d`, preserving concurrent theme/localization work; pending `origin/main` push and ancestry verification.
- Acceptance: simplified maximum/minimum, signed largest absolute version change, threshold-only warning color, honest normalized integral, accessible definitions, demo/version details, RU/KK/EN, themes/mobile, missing-version/data handling.
- Formula audit: nulls are excluded; versions match one `asset_id` and exact `target_time`; largest absolute difference keeps its sign; warning threshold stays inclusive at `0.15`; integral is `sum(normalized prediction × 1 hour)`.
- Normalization is not confirmed against nominal capacity, so the UI makes no MW/MWh, physical-energy, nominal-capacity, or full-power-equivalent claim.
- PASS before rebase: core 44/44, focused regressions, lint, typecheck, build, diff check, and production-browser review in light/dark, desktop/mobile, ready/partial, RU/EN, and keyboard-tooltip states. Per the latest user instruction, checks were not repeated after conflict reconciliation.
- Touched: overview component/metrics/styles, i18n messages, focused tests. Screenshot: ignored `.next/ui-qa/forecast-kpi-cards.png`.
- Next: commit this reconciliation, push integration HEAD to `origin/main`, and verify `95a413f` ancestry.

## UI theme and localization readability (preserved from origin/main)

- Updated UTC: 2026-09-23 12:31Z
- Branch/worktree: `chore/integrate-theme-i18n-readability` / private integration worktree.
- Base/integration: validated task `d456c86` is merged over latest `origin/main` at `ce623b4`, preserving the job/login/history/chart work.
- Owner/status: Codex; implementation and browser validation pass, pending integration commit, `origin/main` push, and ancestry verification.

## Active task

- Theme colors now use shared semantic tokens for controls, statuses, focus, selected and disabled states; dark-theme hardcoded light success/button colors were removed.
- Noto Sans is self-hosted through `next/font` with Latin and Cyrillic subsets for Russian and Kazakh glyphs.
- Language controls and options use theme surfaces; long localized labels wrap or receive full-width mobile controls instead of clipping.
- Added the missing English/Kazakh translation for `Проверяем…`.
- Touched paths: `src/app/globals.css`, `src/app/layout.tsx`, `src/lib/i18n/messages.ts`, and UI browser tests/docs.

## UI validation

- PASS: readability matrix — 2 themes × 3 languages × 2 viewports × 4 routes, including contrast, clipping, overflow, font loading, hover/focus/selected/disabled; screenshots saved in ignored `.next/ui-qa/readability/`.
- PASS: platform browser suite (10 scenarios) and dashboard browser suite (14 scenarios) against the production build in Microsoft Edge.
- PASS: `npm test` (32), UI unit suite (11), lint, typecheck, and production build.
- No further test reruns requested before Git integration.

## Job refresh feedback (preserved from origin/main)

- Task `d47902c` and state commit `ce623b4` preserve stable loading states, retained job data on errors, timestamps, retry/`aria-live` feedback, serialized polling, terminal stopping, and stale-response protection.
- Remote handoff reports PASS: typecheck, lint, UI contract tests (12/12), and diff check; production build/browser QA were skipped by that task's user instruction.

## Minimal login hero (current task)

- Exact RU/KK/EN forecast heading and description replace the promotional copy; platform eyebrow, repeated captions, forced break, and accent-only line are removed.
- Heading is 600 at 40–48 px desktop and 28–32 px mobile; description is 16–17 px with normal contrast/leading. The existing system font, login controls, language/theme controls, and compact turbine illustration are preserved.
- Touched: `src/components/platform/login.tsx`, `src/app/globals.css`, `src/lib/i18n/messages.ts`, `tests/ui/platform.test.cjs`.
- PASS on task/latest-base build: core 42, UI/unit 9, lint, typecheck, production build (21 routes/pages), and diff review.
- PASS on production browser build: RU/KK/EN × light/dark at desktop 1440×900 and mobile 390×844; exact copy, no horizontal overflow, clipping, or hero/card overlap, and no browser warnings/errors. Screenshots are under ignored `.next/ui-qa` in the task worktree.
- No dependency, backend, business-logic, authentication, or persisted-data changes.
- PASS after latest-main merge: core 42, UI/unit 14, lint, typecheck, production build (21 routes/pages), and diff review. Login and chart/i18n changes auto-merged without code conflicts; `STATE.md` was reconciled manually.
- Remote verification: `origin/feat/minimal-landing-hero` resolves to `71da309`; `git merge-base --is-ancestor 71da309 origin/main` passes at remote main `ebb36cc`.
- Next: user visual review; no remaining action for the login hero.

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
