# Project state — Russian project README

- Updated UTC: 2026-09-23 11:40Z
- Branch/worktree: `docs/russian-project-readme` / `.worktrees/russian-project-readme`
- Base: local `main` at `b7fee06`; `origin/main` last-known at the same commit.
- Owner/status: Codex; detailed Russian README implemented and validated, commit pending.

## Current demo and implementation

- Protected Next.js dashboard exposes overview, forecast, sources, and agent journal pages with explicit synthetic fixture and real-API modes.
- PostgreSQL migrations, confirmed CSV ingestion, canonical observations, persistence forecasts, durable agent jobs, and replay runtime are integrated.
- The Open-Meteo connector has saved provenance evidence but does not populate canonical production weather tables.
- Official February scoring remains blocked: supplied CSV files end on 2026-01-31 and trusted historical weather publication times are unavailable.

## Active task

- Goal: replace the partial English README with a detailed Russian project guide based on `docs/hackalem-ai-agentic-wind-forecasting.md` and verified repository behavior.
- Acceptance: explain the problem, status, architecture, Docker/local setup, UI, API flow, data contract, agent/replay/model behavior, checks, environment, repository structure, limitations, and documentation links without overstating completeness.
- Touched paths: `README.md`, `STATE.md`.

## Validation

- PASS: every relative Markdown link in `README.md` resolves to an existing repository path; `git diff --check` is clean.
- PASS: core tests 32/32, foundation 4/4, agent 12/12, replay 1/1, weather 25/25, acceptance harness 2/2.
- PASS: `npm run lint`, `npm run typecheck`, and `npm run build`.
- SKIP: PostgreSQL integration, live OpenAI smoke, and Docker checks are not required for this documentation-only diff and need external services/configuration.
- BLOCKED: `git fetch --all --prune` returned `Repository not found` for the configured GitHub remote; remote synchronization must be retried after repository access is restored.

## Decisions and constraints

- Documentation clearly separates synthetic UI fixtures, implemented backend behavior, and unavailable official February evidence.
- README does not claim MW/MWh output, February metrics, trusted archival weather availability, or production ridge inference.
- The standalone dispatcher and current real-API dashboard contract mismatch are documented as limitations.

## Next actions

1. Commit the reviewed task branch.
2. Integrate it into local `main` from a separate worktree and re-run critical checks.
3. Retry task-branch and `main` pushes when `origin` access is available; verify task ancestry on `origin/main`.
