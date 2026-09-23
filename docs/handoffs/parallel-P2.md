# P2 — trained inference handoff

Updated: 2026-09-23 UTC. Owner: P2 / Codex. Branch: `feat/p2-trained-inference`.
Status: implementation validated in the task worktree; repeated integration checks skipped by explicit user instruction; local main delivery via serialized fast-forward. Historical approval BLOCKED by missing archived training inputs. P6 wiring pending; this is not P7 E2E.

## Delivered boundary

`src/server/ml/inference/index.ts` exports
`predictApprovedModel(request: ForecastRequest, snapshot: ForecastInputSnapshot, artifact: unknown): Promise<ReturnType<typeof predictPersistence>>`.
It returns existing `ForecastValue[]` with `normalized` units and exact target hours 1…24/48. Invalid/incomplete features, wrong provider/model/height/unit, unavailable weather/observations, unknown assets, unsupported artifacts, non-approved models and mismatched model IDs throw. There is no production fallback. Existing `predictPersistence` remains the explicit baseline.

Existing `ModelArtifact` schemaVersion 1 is preserved, with an additive `deployment` section (runtime Zod schema in `inference/artifact.ts`). Old training-job artifacts without deployment evidence remain valid legacy artifacts but cannot be served by this approved inference boundary. Deployment records status, modelVersionId, version, normalized unit, feature selectors/order, training snapshot hashes, paired persistence metrics/folds, evidence class, approval reason and SHA-256. Ridge retains its existing scaler/weights/lambda/iterations; power curve retains bins/points. The checksum is canonical sorted-key JSON with `deployment.checksum` replaced by an empty string, not the raw file byte hash.

P6 must load artifacts from its trusted model registry/storage, check registry status/version/codeVersion and the raw storage hash there, and pass the loaded JSON here. A self-checksum detects corruption, not a malicious publisher. This module does not register models, add queues, read evaluation storage or modify agent/service code.

## P6 snapshot requirements

- Retain `temperature` in °C at 2 m and `wind_speed` in m/s at 100 m for the default P1 selectors, including `heightMetres`. Selectors/provider/model are explicit artifact metadata, not hard-coded production fallbacks.
- Current base `buildForecastSnapshot` retains only wind; current agent adapter drops temperature and height. Both need P6 integration before these artifacts can be served. P2 intentionally rejects that incomplete snapshot rather than imputing temperature.
- Runs need canonical `runTime`, `publishedAt`, `availableAt` <= issuedAt, a raw artifact ID, and matching provider/model. Availability assumptions without a publication time are insufficient for P2 historical approval.
- For a January 31 release train with cutoff <= that issue time. A February 1 cutoff cannot legally serve January 31. `createdAt` is separate build metadata and must be supplied explicitly for reproducibility.
- Call `predictApprovedModel` only for an approved trained artifact; keep persistence selection explicit in both production paths. Synthetic artifacts stay candidates; test-only approval helpers live exclusively in `tests/ml`.

## Training and CLI

`trainApprovedModel` in `src/server/ml/training/approved.ts` reuses feature building/scaling, ridge, power curve and temporal candidate validation. It adds no dependencies or package scripts.

Run:

```sh
node node_modules/tsx/dist/cli.mjs scripts/train-approved.ts --input manifest.json --out .data/ml/approved
```

Input is the exported `ApprovedTrainingInput`:

```ts
{
  cutoff, createdAt, codeVersion, modelVersionId, version,
  evidence: "historical", targetDataPolicy: "history_only",
  featureSpec: {
    source: "archived_forecast", provider, weatherModel,
    wind: {metric: "wind_speed", unit: "m/s", heightMetres: 100},
    temperature: {metric: "temperature", unit: "°C", heightMetres: 2}
  },
  releases: [{request, snapshot, targets: Observation[]}],
  ridgeLambdas: [0.1, 1, 10]
}
```

Requests/snapshots/targets use shared contracts, not a new forecast DTO. `targets` must be exact canonical historical training observations matching each requested point, with unit/quality and availability checks. Inputs must come from training storage; never export evaluation-only actuals into this manifest. The producer must attest archive provenance and semantic mappings; text labels alone do not prove the real-world source.

All target times and target availability must be strictly before cutoff, which cannot exceed February 1. February targets are rejected before selection. Temporal folds also exclude labels unavailable at their training boundary and validation releases issued before that boundary. There are three sequential pre-cutoff folds; candidates use history windows 3/6/12/full and ridge lambda grid, power curve and mean baseline. Persistence comes from each snapshot's selected as-of observation and is compared on the identical validation pairs. Approval requires historical evidence and strictly lower pooled MAE than persistence; synthetic evidence and no gain produce candidates. No statistical-significance claim is made.

Output: content-addressed artifact JSON and `report.json` containing selected parameters, all temporal folds/candidate metrics and persistence metrics. Same manifest produces the same artifact/checksum. Retain the input manifest alongside the artifact for audit/retraining. No input: exit 2, report `BLOCKED`, artifact null. Invalid input: exit 1, report `FAILED`, artifact null. Candidate or approved result: exit 0 with explicit status, never forced approval.

## Measured evidence

Synthetic controlled fixture only (`tests/ml/approved-fixtures.ts`): 7 releases, July 2025–January 2026; 48 hours each. Validation is November, December, January, N=48 per fold and N=144 pooled. Selected `power_curve:3m`, MAE=7.517135062566164e-17, RMSE=8.526655581212258e-17. Persistence on the same pairs: MAE=0.34, RMSE=0.36696957185394363. Status remains **candidate**. Near-zero error is expected for this constructed power-curve relation and is not real forecast skill. Separate ridge test confirms temperature sensitivity with the same train/inference feature preparation.

Real resource audit: turbine 1 has 142360 CSV rows; turbine 2 has 149499. Last nonempty power timestamp in both is `2026-01-31 23:50:00`, February rows=0. These are observed-weather records, not archived forecast feature pairs. No real historical improvement/approval is claimed. Obtain canonical archived pre-February forecasts, confirmed normalization/time/asset semantics and paired training observations before a historical CLI run. February actuals are not needed for training and must remain isolated for P5 evaluation.

## Checks and next actions

- PASS: targeted ML suite, 15/15 including CLI roundtrip, deterministic retraining, 24/48 coverage, weather sensitivity, invalid feature/artifact rejection, delayed-label purge and no-gain candidate behavior.
- PASS: full suite `node node_modules/tsx/dist/cli.mjs --test tests/**/*.test.ts`, 51/51 (same command as npm test); `npm run typecheck`; `npm run lint` and focused ESLint over ML/tests/CLI; `npm run build`, 21 pages; staged diff check and scoped secret-pattern review (no matches).
- Initial build FAILED due to a node_modules junction outside Turbopack root; fixed by physical local `npm ci --prefer-offline --no-audit --no-fund`, without manifest/lockfile changes. An early build during dependency extraction failed on missing Next declarations; canonical build/typecheck passed after installation finished.
- Remote fetch BLOCKED: configured GitHub origin returns `Repository not found`.
- Next: P6 connects both inference paths; obtain real archive training inputs; P7 runs complete acceptance after parallel integration.

- Repeated integration checks SKIPPED by explicit user instruction; task checks already passed; task commit c1ba6aa2b915c31934c484c52bc8cf5bbf4424c0, base e285f93ec0a49208ee854047109861face3879fa. The dependency junction is intentional in the integration worktree; webpack supports it. Remote push also failed with Repository not found.
