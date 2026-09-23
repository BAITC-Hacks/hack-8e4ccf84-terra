# Project state

Updated UTC: 2026-09-23T09:01:47.665832+00:00
Branch: `docs/s09-reproducibility`; last verified base `c2b4003`; changes `uncommitted`.
Owner: S09 / Codex. Status: BLOCKED for final acceptance; early handoff validated.

## Verified demo path

`npm ci`, `npm run build`, `npm run start -- --hostname 127.0.0.1`: starter at `/`; no integrated wind forecast API. Earlier STATE scaffold/untracked and inaccessible-remote claims are stale: base is tracked and fetch succeeds. S01–S08 integration is absent in inspected base. Other owners' branch progress UNKNOWN; no claims made about their completion.

## Current task / touched paths

S09 reproducibility: README, Makefile, docs/demo.md, docs/acceptance.md, tests/acceptance, samples, STATE.md. Acceptance requires AC-01…AC-16, real model/baseline report, restore verification and clean Docker forecast. All product AC BLOCKED. Synthetic 48-hour import fixture is CC0 and is not quality evidence. Wrappers fail closed on missing owner implementations.

## Checks

- PASS `node --test tests/acceptance/harness.test.mjs`: 2 tests, 0.47 s (fixture SHA/time/value integrity; missing scripts and invalid input).
- PASS `npm run lint`: 4.19 s.
- PASS `npm run build`: 10.52 s, TypeScript and starter routes.
- PASS `npm ci --no-audit --no-fund`: 25 s; unrs-resolver install-script warning recorded in acceptance report.
- BLOCKED `node tests/acceptance/run.mjs verify`: exit 2, missing script/Compose.
- BLOCKED `docker compose up --build`: Docker unavailable; Compose absent.
- NOT_RUN model comparison, backup/restore and product AC; see docs/acceptance.md.

## Constraints / next actions

1. Owners S01–S08 integrate implementations and fixed CLI contracts requested in docs/acceptance.md. No foreign server/config code changed.
2. S09 reruns docs/demo.md in clean Docker environment, records actual IDs/hashes/durations, restoration and all 16 AC. Full data permissions/time conventions/weather archive must be established by S00/S03.
3. Compare model with baseline on identical February pairs; do not claim improvement without numerical evidence. Final S09 is not complete.

Remote: fetch succeeds. Latest observed origin/main advanced to `0d251d6` (AGENTS/SLICES documentation updates); integrate before push. No verified task push yet.

Tangible milestone: reproducibility handoff, safe command wrappers, deterministic synthetic data and passing harness tests. No deployment or PR.
