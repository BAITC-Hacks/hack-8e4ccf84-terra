# P6 runtime wiring

- Owner: Codex; branch feat/p6-runtime-wiring. Status: integration pending for the gaps below; not a P7 E2E claim.
- P2 c1ba6aa, P3 c07e170 and P5 223df62 were merged as validated dependencies without editing their owned modules.
- Both production paths now use createApprovedInference: explicit persistence baseline, otherwise P2 predictApprovedModel. Loader verifies registry approval/version/codeVersion/cutoff, trusted raw_artifacts SHA-256, parsed artifact checksum and confined artifact storage path. No fallback on trained-model failure.
- Injected interfaces remain available for contract tests. Synchronous trained snapshots retain all selected-run features from the same read; agent retains temperature/height/quality flags. P3 trigger jobs use pinned snapshots and fail closed if missing or mismatched.
- Dashboard translates canonical forecast/job/journal/evaluation envelopes; durable launches use /agent-runs; missing inputs and N=0 reasons remain visible; API errors never switch to fixtures. History UI is unchanged.
- compose.yaml builds one shared runtime image; migration completion and DB/app health gate dispatcher startup. compose.workers.yaml adds existing P3 worker and an idempotent P5 polling wrapper, with environment secrets, explicit read-only config mounts and shutdown/restart handling.

## Deployment contract

Use `docker compose -f compose.yaml -f compose.workers.yaml up --build -d` only when explicitly deploying. Set INPUT_TRIGGER_CONFIG to P3's calendar/config JSON and EVALUATION_CONFIG to P5's request JSON (forecastRunIds, calendarTimezone, manifest). EVALUATION_POLL_MS defaults to 30000. No calendar, asset IDs, model or semantic confirmation is invented. Worker reports are stored by P5; actual revisions cause new report versions.

Trained model files must be registered by the trusted operator in model_versions/raw_artifacts: approved status, model version, code_version, training_cutoff, artifact_id and raw file SHA-256. Store the exact JSON under ARTIFACT_ROOT (Compose: /app/artifacts), and use its container-visible absolute path in raw_artifacts.path. P2's self-checksum is separate from the raw byte SHA-256. No real artifact is approved by this wiring change.

## Remaining integration gaps

- P3 currently pins wind-only snapshots; trained P2 requires temperature and height. These trigger jobs fail MODEL_INPUTS_INVALID rather than reading newer inputs or inventing features. P3 must persist the complete immutable feature set before trained automatic-cycle acceptance.
- Existing /evaluations/:id reads the legacy in-memory backtest registry. P5's persisted reports need a coordinated API-owner change; the client correctly handles the existing report envelope and unavailable response. P6 does not edit out-of-scope API/backtest files.
- Real approved historical artifact, trusted archival publication times, confirmed source semantics and February actuals remain unavailable. No real model skill/February metrics are claimed.

## Checks and user overrides

- Before the user's stop-tests instruction: npm test 49 PASS; forecast/agent/replay/UI regression 24 PASS; runtime wiring 7 PASS, PostgreSQL opt-in skipped. Lint/typecheck/local Next build passed on the first wiring milestone.
- After dependency wiring: typecheck and Next compile/typecheck passed; final build completion recorded during integration if available. Compose base+worker config parsed successfully. Earlier junction build failure and test typing failure were corrected.
- Docker builds of the earlier wiring context passed Next compilation/typecheck; images were not started. No project/service was launched.
- User explicitly instructed: no further tests, no project startup, prioritize delivery to main. PostgreSQL/Compose smoke and all new test executions SKIPPED. Final integration uses diff review; no runtime acceptance claim.
- Remote fetch/push attempts return Repository not found in this environment. Retry normal push; if still blocked, local main delivery is reported separately.
