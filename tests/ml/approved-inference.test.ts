import assert from "node:assert/strict";
import test from "node:test";
import {predictApprovedModel, prepareForecastExamples} from "../../src/server/ml/inference";
import {artifactChecksum, parseDeployableArtifact} from "../../src/server/ml/inference/artifact";
import {trainApprovedModel} from "../../src/server/ml/training/approved";
import {trainRidge} from "../../src/server/ml/ridge";
import {validateCandidates} from "../../src/server/ml/validation";
import {approveFixture, featureSpec, release, trainingInput} from "./approved-fixtures";

const trained = trainApprovedModel(trainingInput());
const approved = approveFixture(trained);

test("training is reproducible and synthetic evidence never receives approval", () => {
  assert.deepEqual(trainApprovedModel(trainingInput()), trained);
  assert.equal(trained.deployment.status, "candidate");
  assert.ok(trained.validation.candidates.find((row) => row.id === trained.selectedCandidateId)!.aggregate!.mae <
    trained.deployment.persistence.aggregate.mae);
  assert.equal(trained.deployment.persistence.folds.length, 3);
  assert.equal(trained.deployment.persistence.aggregate.count, 144);
  assert.equal(trained.deployment.trainingSnapshotHashes.length, 7);
  const historicalAdapter = trainingInput(); historicalAdapter.evidence = "historical";
  assert.equal(trainApprovedModel(historicalAdapter).deployment.status, "approved");
});

test("24/48 complete normalized points use the same features and react to weather", async () => {
  for (const horizon of [24, 48] as const) {
    const {request, snapshot} = release(undefined, horizon);
    const points = await predictApprovedModel(request, snapshot, approved);
    assert.equal(points.length, horizon);
    assert.equal(points[0].targetTime, "2026-02-01T01:00:00.000Z");
    assert.equal(points.at(-1)!.targetTime, new Date(Date.parse(request.issuedAt) + horizon * 3_600_000).toISOString());
    assert.ok(points.every((row) => row.unit === "normalized" && Number.isFinite(row.value)));
    const changed = structuredClone(snapshot);
    changed.weatherValues.find((row) => row.metric === "wind_speed")!.value = 14;
    const next = await predictApprovedModel(request, changed, approved);
    assert.ok(Math.abs(next[0].value - points[0].value) > 0.1);
    assert.equal(prepareForecastExamples(request, snapshot, featureSpec)[0].windSpeed, 3);
  }
});

test("ridge inference honors serialized feature order/scaling and temperature sensitivity", async () => {
  const artifact = structuredClone(approved);
  const data = trainingInput().releases.flatMap(({request, snapshot}) =>
    prepareForecastExamples(request, snapshot, featureSpec).map((row) => ({...row,
      target: row.windSpeed * 0.01 + row.temperature * 0.2})));
  artifact.model = trainRidge(data, artifact.deployment.featureDefinition, {lambda: 0.1});
  const candidate = artifact.validation.candidates.find((row) => row.kind === "ridge" && row.eligible)!;
  artifact.selectedCandidateId = artifact.validation.selectedCandidateId = candidate.id;
  artifact.deployment.checksum = artifactChecksum(artifact);
  const {request, snapshot} = release();
  const initial = await predictApprovedModel(request, snapshot, artifact);
  snapshot.weatherValues.find((row) => row.metric === "temperature")!.value += 10;
  const next = await predictApprovedModel(request, snapshot, artifact);
  assert.ok(next[0].value - initial[0].value > 1);
  for (const corrupt of [
    {...artifact.model, scaler: {...artifact.model.scaler, scales: [0]}},
    {...artifact.model, weights: [0]},
  ]) {
    const invalid = {...artifact, model: corrupt};
    invalid.deployment = {...artifact.deployment, checksum: ""};
    invalid.deployment.checksum = artifactChecksum(invalid);
    await assert.rejects(predictApprovedModel(request, snapshot, invalid));
  }
});

test("invalid inputs, incomplete horizons and future weather are rejected", async () => {
  const mutations: Array<(value: ReturnType<typeof release>) => void> = [
    ({snapshot}) => { snapshot.weatherValues.pop(); },
    ({snapshot}) => { snapshot.weatherValues[0].value = NaN; },
    ({snapshot}) => { snapshot.weatherValues[0].value = -1; },
    ({snapshot}) => { snapshot.weatherValues[0].unit = "km/h"; },
    ({snapshot}) => { snapshot.weatherValues[0].heightMetres = 10; },
    ({snapshot}) => { snapshot.weatherValues.push(snapshot.weatherValues[0]); },
    ({snapshot}) => { snapshot.weatherRuns[0].availableAt = "2026-02-02T00:00:00.000Z"; },
    ({snapshot}) => { snapshot.weatherRuns[0].publishedAt = null; },
    ({snapshot}) => { snapshot.weatherRuns[0].model = "reanalysis"; },
    ({snapshot}) => { snapshot.observations[0].availableAt = "2026-02-02T00:00:00.000Z"; },
    ({request}) => { request.dataPolicy = "evaluation_only"; },
    ({request}) => { request.assetIds = ["unknown"]; },
    ({snapshot}) => { snapshot.missing = ["weather"]; },
  ];
  for (const mutate of mutations) {
    const value = release(); mutate(value);
    await assert.rejects(predictApprovedModel(value.request, value.snapshot, approved));
  }
});

test("unsupported, corrupt, unapproved or wrong-version artifacts cannot fall back", async () => {
  const {request, snapshot} = release();
  await assert.rejects(predictApprovedModel(request, snapshot, trained), /not approved/);
  await assert.rejects(predictApprovedModel({...request, modelVersionId: "wrong"}, snapshot, approved));
  await assert.rejects(predictApprovedModel(request, snapshot, {...approved, schemaVersion: 2}));
  await assert.rejects(predictApprovedModel(request, snapshot, {...approved, codeVersion: "tampered"}), /checksum/);
  const badOrder = structuredClone(approved);
  badOrder.deployment.featureDefinition.names.reverse();
  badOrder.deployment.checksum = artifactChecksum(badOrder);
  assert.throws(() => parseDeployableArtifact(badOrder), /feature order/);
  const past = release("2026-01-31T00:00:00.000Z");
  await assert.rejects(predictApprovedModel(past.request, past.snapshot, approved), /cutoff/);
});

test("February targets, unavailable targets, actual-weather semantics and evaluation inputs are refused", () => {
  const future = trainingInput(); future.releases.push(release());
  assert.throws(() => trainApprovedModel(future), /cutoff/);
  const delayed = trainingInput(); delayed.releases[0].targets[0].availableAt = "2026-02-01T00:00:00.000Z";
  assert.throws(() => trainApprovedModel(delayed), /unavailable/);
  const evaluation = trainingInput(); Object.assign(evaluation, {targetDataPolicy: "evaluation_only"});
  assert.throws(() => trainApprovedModel(evaluation), /policy/);
  const observed = trainingInput(); Object.assign(observed.featureSpec, {source: "observed_weather"});
  assert.throws(() => trainApprovedModel(observed));
  const duplicate = trainingInput(); duplicate.releases.push(duplicate.releases[0]);
  assert.throws(() => trainApprovedModel(duplicate), /Duplicate/);
});

test("no demonstrated improvement leaves the model a candidate", () => {
  const input = trainingInput();
  for (const row of input.releases) for (const target of row.targets) target.value = 0;
  input.evidence = "historical"; // controlled test adapter, not a historical evidence claim
  const artifact = trainApprovedModel(input);
  assert.equal(artifact.deployment.status, "candidate");
  assert.equal(artifact.deployment.persistence.aggregate.mae, 0);
});

test("temporal folds purge delayed labels and releases issued before their validation boundary", () => {
  const rows = trainingInput().releases.flatMap(({request, snapshot, targets}) =>
    prepareForecastExamples(request, snapshot, featureSpec).map((row, i) => ({...row,
      target: targets[i].value, issuedAt: request.issuedAt, targetAvailableAt: targets[i].availableAt!})));
  const options = {cutoff: "2026-02-01T00:00:00.000Z", historyWindows: ["full"] as const, ridgeLambdas: [0.1]};
  const normal = validateCandidates(rows, options);
  const changed = structuredClone(rows);
  // July labels were not available during November validation training.
  changed.filter((row) => row.timestamp.startsWith("2025-07")).forEach((row) => {
    row.targetAvailableAt = "2025-11-15T00:00:00.000Z";
  });
  // A forecast issued in October cannot be validated against a model trained through October.
  changed.find((row) => row.timestamp.startsWith("2025-11"))!.issuedAt = "2025-10-31T23:00:00.000Z";
  const purged = validateCandidates(changed, options);
  assert.equal(purged.candidates[0].folds[0].trainCount, normal.candidates[0].folds[0].trainCount - 48);
  assert.equal(purged.candidates[0].folds[0].validationCount, normal.candidates[0].folds[0].validationCount - 1);
});
