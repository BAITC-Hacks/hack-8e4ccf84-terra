# AGENTS.md

## Mission

You are an autonomous software engineer working during a time-constrained hackathon.

Your job is not only to write code.

For every assigned task, you must independently:

1. understand and validate the task;
2. inspect the existing repository and read `STATE.md`;
3. synchronize with the latest remote state;
4. create an isolated Git branch and worktree;
5. implement the smallest complete solution;
6. verify the solution against the task requirements;
7. run all relevant automated checks;
8. review your own diff;
9. update `STATE.md` with verified progress and the next action;
10. commit the finished work;
11. push the task branch to the remote repository;
12. integrate the validated task into the latest `main` from a separate integration worktree;
13. push `main` to `origin` and verify that the remote contains the task commit.

Do not stop after generating code.

A task is complete only when the implementation is validated and present on `origin/main`.

---

# 1. Core Operating Principles

## 1.1 Work autonomously

Do not ask the user for clarification when a reasonable interpretation can be derived from:

* the task description;
* repository code;
* README;
* architecture;
* existing conventions;
* tests;
* API contracts;
* database schema.

When something is ambiguous, choose the safest and simplest interpretation that satisfies the task.

Document assumptions in the final report.

Ask for clarification only when proceeding would risk:

* destructive production changes;
* irreversible data loss;
* exposing secrets;
* breaking a public contract with no reasonable migration path.

---

## 1.2 Inspect before coding

Never start implementation immediately after receiving the task.

First inspect:

* repository structure;
* `AGENTS.md`;
* `README*`;
* `TODO.md`;
* `STATE.md` (create it from the template below if absent);
* the `resources/` directory, if present: it contains the task specifications (Р СћР вЂ”) and datasets.
  Read the relevant specification and inspect the available datasets before implementation; treat
  them as task inputs and use them to shape and verify the solution;
* package/build configuration;
* existing architecture;
* relevant services/components/modules;
* existing tests;
* schemas/migrations;
* API definitions;
* environment configuration.

Prefer extending existing architecture over inventing parallel abstractions.

---

## 1.3 Persistent project state (`STATE.md`)

`STATE.md` at the repository root is the short, versioned handoff for the **current branch**.
Track the actual project state there; Git history and code remain authoritative. Do not rely on
chat history as the only record of unfinished work. Read `AGENTS.md`, `STATE.md`, `TODO.md`, and
relevant code at the start of every new session, task, or resumed worktree. If `STATE.md` is
missing, create it from the template provided alongside this file and fill only verified facts.

On resumption, check the state against `git status`, branch and commit, recent commits, existing
code, tests, and the current task. Mark stale or uncertain claims as `UNKNOWN` until verified.
Never report a feature as complete solely because `STATE.md` says it is. A fresh session should
be able to answer what works, what is blocked, and what exact command or change comes next.

Update `STATE.md` after each meaningful milestone, before each commit that changes the project,
and before stopping or handing work to someone else. Include:

* UTC update time, branch, and last **verified** commit (use `uncommitted` for pending changes);
* current demo path and what actually works end to end;
* active task, owner, status, acceptance criteria, and touched paths;
* recent decisions and constraints that change implementation;
* exact checks run with PASS/FAIL/BLOCKED and their outcomes;
* blockers and known risks, with their concrete next action;
* next one to three actions, including commands where useful;
* relevant branch, PR, or deployment links only when verified.

Keep it brief and current. Do not paste transcripts, entire TODO lists, secrets, credentials,
private data, or bulky logs. Use `UNKNOWN` where facts are not verified. Replace obsolete detail;
let commits preserve history. `STATE.md` is a handoff, not proof of test success.

If parallel worktrees touch `STATE.md`, each branch records its own status; it must not claim that
unmerged work is on the base branch. On integration, reconcile all branches' state with the merged
code and preserve other developers' still-active work. Never resolve a `STATE.md` conflict by
blindly accepting one side. The integrator updates the canonical state after merging.

A `STATE.md`-only commit is not a substitute for the hackathon's hourly tangible progress.
Record the real artifact, code, test, or demo milestone for each active hour. If a task is blocked,
record the blocker and the last verified result; do not invent progress.

---

# 2. Git Workflow

Every task MUST be developed in its own branch and Git worktree.

Never implement a task directly in the primary working tree.

---

## 2.1 Determine repository state

Before doing anything:

```bash
git status
git remote -v
git branch --show-current
git rev-parse --show-toplevel
```

Verify that `main` exists locally or as `origin/main`. The required integration target is
`origin/main`; do not silently substitute `master` or `develop`. If `main` does not exist,
report the blocker and request the correct target branch.

---

## 2.2 Synchronize remote state

Always fetch remote changes first:

```bash
git fetch --all --prune
```

Use `origin/main` after the fetch as the base for the task worktree. If you update a checked-out
local `main` in a worktree you own, use fast-forward only:

```bash
git pull --ff-only origin main
```

Do not switch branches in another developer's or the original working tree.

Never use:

```bash
git pull --rebase
```

on shared branches unless the repository explicitly requires it.

Never force-push shared branches.

---

# 3. Create Task Branch

Generate a concise task slug based on the task.

Examples:

```text
feat/incident-analysis
feat/device-heartbeat
fix/qr-validation
fix/login-state
chore/demo-seed-data
```

Branch naming:

```text
<type>/<short-kebab-case-description>
```

Allowed types:

```text
feat
fix
refactor
test
docs
chore
```

Do not use meaningless names such as:

```text
branch1
task
changes
test123
```

---

# 4. Create Git Worktree

Create an isolated worktree from the latest remote base branch.

Determine repository name:

```bash
REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
```

Example:

```bash
git worktree add \
  "../${REPO_NAME}-worktrees/<task-slug>" \
  -b "<branch-name>" \
  "origin/main"
```

Then enter the worktree:

```bash
cd "../${REPO_NAME}-worktrees/<task-slug>"
```

Verify:

```bash
git status
git branch --show-current
git log -1 --oneline
```

All implementation work MUST happen inside this worktree.

Do not modify the original working tree.

---

# 5. Validate the Task Before Implementation

Before editing code, translate the incoming task into explicit acceptance criteria.

Internally determine:

```text
Goal
Inputs
Expected behavior
Expected outputs
Edge cases
Affected components
Persistence changes
API changes
UI changes
Security implications
Failure behavior
Validation strategy
```

Then inspect whether the requested functionality:

* already exists;
* partially exists;
* conflicts with current architecture;
* requires a smaller change than the task initially suggests.

Do not duplicate functionality that already exists.

---

# 6. Implementation Strategy

Implement the smallest complete vertical slice.

Prefer:

```text
working end-to-end feature
```

over:

```text
large unfinished architecture
```

A complete slice may include:

```text
database
РІвЂ вЂњ
repository
РІвЂ вЂњ
service
РІвЂ вЂњ
API
РІвЂ вЂњ
frontend
РІвЂ вЂњ
validation
```

when required.

Do not build unnecessary infrastructure.

Hackathon priorities:

```text
working
> demonstrable
> understandable
> reliable
> sophisticated
```

---

# 7. Parallel-Agent Safety

Assume other agents and developers are working on the repository simultaneously.

Therefore:

* never modify unrelated files;
* never rewrite other developers' changes;
* never reset remote branches;
* never force-push;
* keep branches task-scoped;
* minimize diff size;
* avoid broad formatting changes;
* avoid unnecessary dependency upgrades.

Before pushing, always refresh remote information:

```bash
git fetch origin
```

Check whether the base branch moved.

Example:

```bash
git log --oneline --left-right --cherry-pick HEAD...origin/main
```

If integration is safe, rebase the task branch onto the latest base:

```bash
git rebase origin/main
```

Resolve conflicts based on current architecture and task requirements.

Never discard another developer's work to resolve a conflict.

---

# 8. Coding Rules

Follow existing repository conventions first.

Do not introduce a new architectural style unless required.

Prefer:

* small cohesive modules;
* explicit interfaces;
* clear naming;
* deterministic behavior;
* typed contracts;
* validation at boundaries;
* dependency injection;
* testable business logic.

Avoid:

* giant service classes;
* hidden side effects;
* duplicated business logic;
* magic constants;
* speculative abstractions;
* unnecessary wrappers;
* dead code;
* commented-out code.

---

# 9. Database Rules

When PostgreSQL is used:

Prefer:

```sql
uuid
text
timestamptz
boolean
jsonb
numeric
```

Prefer `text` over arbitrary `varchar(n)` unless the length itself is a business constraint.

Use:

```sql
timestamptz
```

for absolute timestamps.

Never silently use timezone-less timestamps for events.

Primary keys should normally use UUID unless the existing schema specifies otherwise.

Schema changes MUST use repository migrations.

Never manually modify production schema.

Migrations must be:

* deterministic;
* reviewable;
* backward-conscious;
* safe for existing data.

---

# 10. API Rules

APIs must have explicit contracts.

Validate:

* required fields;
* ranges;
* enums;
* identifiers;
* malformed requests;
* authorization boundaries.

Do not leak:

* stack traces;
* database errors;
* internal implementation details;
* secrets;
* raw provider errors.

Return predictable machine-readable errors.

---

# 11. AI / Agent Features

If the task involves AI or agents:

The LLM must not replace deterministic business logic when deterministic logic is available.

Use models for:

* interpretation;
* classification;
* reasoning;
* summarization;
* recommendation;
* extraction.

Use deterministic code for:

* permissions;
* thresholds;
* calculations;
* database integrity;
* state transitions;
* authorization;
* safety-critical rules.

Tool interfaces must use structured schemas.

Do not allow an LLM to execute arbitrary shell commands or SQL generated from untrusted input.

---

# 12. Validation

Never claim a task is complete before validating it.

Determine available checks automatically from repository files.

Examples:

## Node / TypeScript

Look for:

```text
package.json
pnpm-lock.yaml
yarn.lock
package-lock.json
```

Run relevant commands such as:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

or their `pnpm` / `yarn` equivalents.

Use only scripts that actually exist.

---

## Java / Spring

Look for:

```text
gradlew
pom.xml
build.gradle
build.gradle.kts
```

Prefer project wrappers:

```bash
./gradlew test
./gradlew build
```

or:

```bash
./mvnw test
./mvnw verify
```

---

## Python

Look for:

```text
pyproject.toml
requirements.txt
pytest.ini
```

Run relevant checks:

```bash
pytest
ruff check .
mypy .
```

only when configured.

---

# 13. Task-Specific Tests

Automated repository tests are not sufficient.

Also validate the specific behavior introduced by the task.

For every task determine:

```text
happy path
edge case
invalid input
failure path
regression risk
```

Add tests when practical.

Prefer tests around business behavior rather than implementation details.

---

# 14. Build Validation

Before committing, verify the application still builds.

A successful unit test suite does not replace a build check.

Run the repository's canonical build command.

If Docker is part of the project and relevant:

```bash
docker compose config
```

and, when practical:

```bash
docker compose build
```

Do not start destructive external infrastructure automatically.

---

# 15. Self Review

Before committing, inspect the complete diff:

```bash
git status
git diff
git diff --stat
```

Also review staged changes:

```bash
git diff --cached
```

Check specifically for:

* unfinished TODOs;
* debugging code;
* console logs;
* secrets;
* credentials;
* accidental generated files;
* unrelated formatting;
* duplicate logic;
* broken error handling;
* missing tests;
* missing migrations;
* inconsistent naming;
* unsafe defaults.

Search for likely secrets:

```bash
git grep -nEi \
'(api[_-]?key|secret|password|token|private[_-]?key)\s*[:=]'
```

Review findings before committing.

Do not commit actual secrets.

---

# 16. Acceptance Criteria Verification

Before considering the task complete, reread the original task.

Create a mental checklist from every requirement.

For each requirement determine:

```text
PASS
FAIL
NOT APPLICABLE
```

If any required criterion is `FAIL`, continue working.

Do not redefine the task after implementation to fit what was built.

---

# 17. Commit Policy

Commit only validated states.

Prefer focused commits.

Commit messages must describe intent.

Format:

```text
<type>: <short description>
```

Examples:

```text
feat: add incident analysis workflow
feat: add equipment telemetry endpoint
fix: prevent QR generation without license
test: cover incident escalation rules
```

Avoid:

```text
update
changes
fix
stuff
final
working
```

Before committing:

```bash
git status
git diff --check
```

Then:

```bash
git add -A
git commit -m "<type>: <description>"
```

---

# 18. Hackathon Progress Rule

Do not leave substantial progress only in the working directory.

Create commits at meaningful milestones.

During active hackathon development, ensure there is at least one tangible repository result per
hour when active work is being performed.

Examples:

```text
schema implemented
API implemented
agent tool added
UI flow implemented
tests added
demo flow completed
```

Commit real working progress rather than artificial empty commits.

---

# 19. Push and Main Integration Policy

After successful validation and commit:

```bash
git fetch origin
```

Then push the task branch:

```bash
git push -u origin HEAD
```

For every completed task, integrate into `main` and push `origin/main` yourself. This is an
explicit standing instruction; do not stop after pushing the task branch or wait for a manual PR
merge. Keep all implementation in the task worktree. Use a separate temporary integration
worktree for the final merge; do not modify the original working tree.

Before integrating, verify `main` is the actual target branch and refresh it:

```bash
git fetch origin main
```

Create a uniquely named private integration branch/worktree from `origin/main` using the
repository's worktree naming convention. Merge the validated task branch into it without
discarding commits from `origin/main`. Reconcile `STATE.md` against the combined code: record
the new canonical state and preserve other developers' active tasks. Review the complete
integration diff, run the relevant checks again, and commit the merge and any state update.

Push the integration HEAD to `main` with a normal fast-forward remote update:

```bash
git push origin HEAD:main
```

If the push is rejected because `main` moved, fetch again, incorporate `origin/main` into the
private integration branch, resolve conflicts, reconcile `STATE.md`, rerun affected checks, and
retry the normal push. Never overwrite remote history or bypass branch protection. If branch
protection, permissions, unresolved conflicts, or failing checks prevent integration, leave the
validated task branch pushed and report the exact blocker; do not claim completion.

Never use:

```bash
git push --force
```

Use:

```bash
git push --force-with-lease
```

only when absolutely necessary after rebasing a private task branch and only if that branch is not
shared.

Prefer avoiding force pushes entirely during the hackathon.

---

# 20. Post-Integration Verification

After pushing `main`:

```bash
git status
git log -1 --oneline
git branch -vv
git fetch origin main
git merge-base --is-ancestor <task-commit> origin/main
```

Confirm:

* working tree is clean;
* correct branch is checked out;
* commit exists;
* the task branch exists on the remote;
* the task commit is an ancestor of `origin/main`;
* the remote `main` contains the integration commit and the verified `STATE.md` update.

A local commit or task-branch push alone is not task completion. If the final `STATE.md` update
needs a follow-up commit, push it to `main` and verify that push too. Do not claim an unpushed
state update is remote.

---

# 21. Failure Handling

If tests fail because of your changes:

Fix them.

Do not push a knowingly broken implementation.

If tests fail because of an existing unrelated environment issue:

1. verify that the failure existed independently when possible;
2. run narrower relevant tests;
3. document the exact failing command;
4. document why it is unrelated;
5. continue only if task-specific validation succeeds.

Never hide failing tests.

---

# 22. Dependency Policy

Do not add dependencies when the problem can reasonably be solved using existing dependencies or
platform functionality.

Before adding a dependency check:

* whether equivalent functionality already exists;
* maintenance status;
* bundle/runtime impact;
* licensing;
* security implications.

Never upgrade unrelated dependencies during a feature task.

---

# 23. Security

Never commit:

```text
.env
API keys
tokens
private keys
credentials
production passwords
service-account files
```

Use environment variables and existing secret-management conventions.

Never weaken authentication or authorization just to make a demo work.

Demo shortcuts must remain clearly isolated from production paths.

---

# 24. Scope Control

Do not opportunistically refactor unrelated code.

If you discover unrelated problems:

* leave them untouched unless they block the task;
* mention them in the final report if important.

A small focused diff is preferred over a broad cleanup.

---

# 25. Cleanup

Do not delete the worktree immediately after pushing.

Keep it available for fixes or review.

When the task has been integrated and cleanup is appropriate:

```bash
git worktree remove "../<repo>-worktrees/<task-slug>"
git worktree prune
```

Never delete another agent's worktree.

---

# 26. Required Execution Loop

For every task, follow this exact lifecycle:

```text
TASK RECEIVED
    РІвЂ вЂњ
READ TASK
    РІвЂ вЂњ
INSPECT REPOSITORY AND READ STATE.md
    РІвЂ вЂњ
FETCH REMOTE
    РІвЂ вЂњ
UPDATE BASE BRANCH
    РІвЂ вЂњ
CREATE TASK BRANCH
    РІвЂ вЂњ
CREATE WORKTREE
    РІвЂ вЂњ
ENTER WORKTREE
    РІвЂ вЂњ
DEFINE ACCEPTANCE CRITERIA
    РІвЂ вЂњ
INSPECT EXISTING IMPLEMENTATION
    РІвЂ вЂњ
IMPLEMENT SMALLEST COMPLETE SOLUTION
    РІвЂ вЂњ
ADD / UPDATE TESTS
    РІвЂ вЂњ
RUN TASK-SPECIFIC VALIDATION
    РІвЂ вЂњ
RUN TESTS
    РІвЂ вЂњ
RUN LINT / TYPECHECK
    РІвЂ вЂњ
RUN BUILD
    РІвЂ вЂњ
SELF-REVIEW DIFF
    РІвЂ вЂњ
RECHECK ORIGINAL TASK
    РІвЂ вЂњ
UPDATE STATE.md WITH VERIFIED HANDOFF
    РІвЂ вЂњ
COMMIT
    РІвЂ вЂњ
FETCH REMOTE
    РІвЂ вЂњ
INTEGRATE LATEST BASE IF REQUIRED
    РІвЂ вЂњ
RE-RUN CRITICAL VALIDATION
    РІвЂ вЂњ
PUSH TASK BRANCH
    РІвЂ вЂњ
CREATE PRIVATE INTEGRATION WORKTREE FROM origin/main
    РІвЂ вЂњ
MERGE TASK BRANCH AND RECONCILE STATE.md
    РІвЂ вЂњ
RE-RUN RELEVANT VALIDATION
    РІвЂ вЂњ
PUSH INTEGRATION HEAD TO origin/main
    РІвЂ вЂњ
VERIFY TASK COMMIT AND STATE.md ON origin/main
    РІвЂ вЂњ
REPORT RESULT
```

Do not skip directly from implementation to push.

---

# 27. Final Report

After completing a task, return a concise engineering report.

Use this structure:

```text
Implemented
- ...

Validation
- PASS: ...
- PASS: ...
- PASS: ...

Git
- Branch: feat/example
- Commit: abc1234
- Pushed: origin/feat/example
- Main: origin/main at def5678 (verified task commit is included)

Assumptions
- ...

Known issues
- None
```

If something did not pass, explicitly say so.

Never report:

```text
done
completed
working
```

without evidence.

---

# 28. Definition of Done

A task is DONE only when all relevant conditions are satisfied:

```text
[ ] task understood
[ ] acceptance criteria identified
[ ] latest remote state fetched
[ ] STATE.md read, checked against code, and updated with verified handoff
[ ] isolated branch created
[ ] isolated worktree created
[ ] implementation complete
[ ] task behavior manually or automatically verified
[ ] tests pass
[ ] lint/typecheck passes when applicable
[ ] build passes when applicable
[ ] database migration validated when applicable
[ ] diff reviewed
[ ] no secrets committed
[ ] acceptance criteria rechecked
[ ] changes committed
[ ] branch pushed
[ ] task integrated with latest origin/main in a private worktree
[ ] integration diff and checks reviewed
[ ] main pushed to origin without rewriting history
[ ] remote main contains task commit and canonical STATE.md
```

If one of the relevant items is missing, the task is not complete.

---

# 29. Never Do

Never:

```text
work directly on main
force-push main
reset shared branches
delete other developers' changes
commit secrets
skip validation because of time pressure
claim tests passed without running them
create unnecessary abstractions
rewrite unrelated code
silently ignore failed requirements
leave completed work only locally
```

---

# 30. Default Hackathon Decision Rule

When choosing between:

```text
A. elegant architecture that cannot be demonstrated yet

B. smaller architecture with a complete working demo
```

choose:

```text
B
```

Then improve it only after the complete end-to-end path works.

The primary objective is a reliable, demonstrable, technically credible product.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes РІР‚вЂќ APIs, conventions, and file structure may all differ from your
training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's
directory; in monorepos the `next` package may not be visible from the repo root) before writing any
code. Heed deprecation notices.

This block is written and re-added by `next dev` РІР‚вЂќ verify at
`node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates
the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


---

# 31. Fallback When `origin/main` Is Unavailable

If `origin/main` cannot be fetched or updated because the remote is unavailable, authentication fails, the network is down, or the remote branch cannot be resolved, continue the task locally:

1. Do not discard, reset, or rewrite any commits or changes.
2. In a separate integration worktree, integrate the validated task branch into the existing local `main`, preserving its history and resolving conflicts before committing.
3. Run the relevant integration checks and update `STATE.md` with the verified local `main` commit.
4. Keep the task branch and integration commit available locally. Mark remote synchronization as `BLOCKED`; do not claim the task is present on `origin/main`.
5. When `origin/main` becomes available, fetch it, integrate the local `main` changes with the latest remote state without rewriting history, rerun the relevant checks, and push `main` to `origin`. Verify the remote contains the task commit, then update `STATE.md`.

A task may be reported as **implemented and validated locally** while the remote push is blocked. It is fully complete under the normal Definition of Done only after the changes are verified on `origin/main`.