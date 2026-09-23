# Project state

> Update this file with verified facts on each branch. Read it at the start of each session.
> Git and the code are authoritative; replace stale details after checking them.

## Snapshot

| Field                                 | Current verified value                                                                                                                |
|---------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| Updated (UTC)                         | 2026-09-23 06:46:25Z                                                                                                                  |
| Branch / worktree                     | `main` / primary worktree at `C:/Users/barys/projects/hack-8e4ccf84-terra`                                                            |
| Last observed commit before this edit | `73344e4` (`Initial commit`)                                                                                                          |
| Base branch / observed commit         | `main` / `73344e4`                                                                                                                    |
| Remote branch / last verified push    | Cached `origin/main` points to `73344e4`; freshness is `UNKNOWN` because `git fetch --all --prune` failed with `Repository not found` |
| Current demo URL / command            | `npm run dev`, then `http://localhost:3000`; currently renders the default Next.js starter page only                                  |

## What works now

- End-to-end demo path: no agent workflow is wired end to end. The only routed page is the
  static Next.js starter at `/`.
- Verified capabilities: dependencies are installed; the untracked Next.js application lints and
  produces a production build. Agent runtime, PostgreSQL repositories, demo-domain tools, and a
  workspace UI exist as source modules under `src/`.
- Gaps in the demo path: `app/page.tsx` does not render `AgentWorkspace`; no API route files exist;
  no automated tests are configured; database-backed execution and the OpenAI-powered workflow
  have not been run.

## Active work

| Task / owner                                 | Status      | Acceptance criteria and evidence                                                                                                                                                                     | Changed paths / branch                                                                                      |
|----------------------------------------------|-------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Agent workspace foundation / owner `UNKNOWN` | IN_PROGRESS | Target inferred from existing source: objective submission, visible event/evidence timeline, approval gate, and final result. Source modules exist, but the routed end-to-end flow is not connected. | All project scaffold files are untracked on `main`: `app/`, `src/`, config/package files, docs, and assets. |

Allowed statuses: `PLANNED`, `IN_PROGRESS`, `BLOCKED`, `VALIDATED`, `PUSHED`.
`PUSHED` refers only to the verified task branch. Record merge or deployment separately.

## Decisions and constraints

- Current work is directly in the primary `main` worktree and remains entirely untracked; no task
  branch or isolated worktree has been created for it.
- The implemented architecture separates deterministic run state, limits, retries, persistence,
  domain tools, and approval handling; these components are not yet reachable from Next.js routes.
- Demo actions are designed to be simulated, based on the UI copy and demo tool source.
- Do not treat the successful build as proof of the agent workflow: the build output exposes only
  `/` and `/_not-found`.

## Validation

| UTC time          | Command or manual scenario                             | Result  | Evidence / remaining issue                                                                                                              |
|-------------------|--------------------------------------------------------|---------|-----------------------------------------------------------------------------------------------------------------------------------------|
| 2026-09-23 06:46Z | `npm run lint`                                         | PASS    | ESLint exited with code 0.                                                                                                              |
| 2026-09-23 06:46Z | `npm run build`                                        | PASS    | Next.js 16.3.6 compiled, TypeScript completed, and static routes `/` and `/_not-found` were generated.                                  |
| 2026-09-23 06:45Z | `git fetch --all --prune`                              | BLOCKED | Remote returned `Repository not found`; current access or remote URL must be fixed before remote state can be refreshed or work pushed. |
| 2026-09-23 06:46Z | Agent workflow happy path, approval path, failure path | NOT_RUN | No API routes are present and runtime database/OpenAI configuration was not exercised.                                                  |

Use `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN`. Never infer PASS from an earlier run
after code or dependencies change. Keep only checks relevant to the current handoff.

## Blockers and risks

| Issue                                                   | Effect                                                                               | Next action / owner                                                                                                                                   |
|---------------------------------------------------------|--------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| Git remote is inaccessible (`Repository not found`)     | Cannot verify current remote state or push work.                                     | Verify repository access and the `origin` URL, then rerun `git fetch --all --prune`.                                                                  |
| Entire application scaffold is untracked on `main`      | Work is not recoverable from Git and violates the required isolated-branch workflow. | Preserve the files, create a task branch/worktree from the correct refreshed base, and move/copy this scaffold into it before further implementation. |
| UI/runtime modules are not wired into App Router routes | Only the starter page is demonstrable; the agent workflow cannot be exercised.       | Add the page and API routes needed by `AgentWorkspace`, then validate against a configured database and OpenAI key.                                   |
| No test script or test files are present                | Business behavior, edge cases, and regressions are unverified.                       | Add focused tests for state transitions, approvals, limits/retries, redaction, and demo tools.                                                        |

## Next actions

1. Restore GitHub access or correct `origin`, fetch the latest base, and create an isolated task
   branch/worktree without losing the current untracked scaffold.
2. Wire `AgentWorkspace` to `/` and add the run, event, cancellation, and approval API routes used
   by `src/ui/agent-workspace.tsx`.
3. Configure a development PostgreSQL database and OpenAI key, add focused tests, and verify the
   `DEMO-001` approval flow plus `DEMO-002` missing-evidence behavior end to end.

## Recent tangible milestones

| UTC time          | Artifact and proof (commit, test, or demo)                                                       |
|-------------------|--------------------------------------------------------------------------------------------------|
| 2026-09-23 06:46Z | Untracked Next.js/agent foundation builds and lints successfully; no artifact commit exists yet. |

Keep this table short. Record real work as it lands; Git history holds older milestones.
The project must show a tangible result for every active hackathon hour.
