import test from "node:test";
import assert from "node:assert/strict";
import type postgres from "postgres";
import type {ModelVersion} from "../../src/server/contracts";
import {ForecastService} from "../../src/server/forecast/service";
import {baselineInference, type ForecastInference} from "../../src/server/forecast/inference";
import {MemoryForecastStore} from "../../src/server/forecast/memory-store";
import {buildModelSnapshot} from "../../src/server/forecast/snapshot";
import {PostgresAgentPorts} from "../../src/server/agent/adapters";
import {executeStep} from "../../src/server/agent/workflow";
import type {AgentPorts} from "../../src/server/agent/ports";
import {fixture, request} from "../forecast/fixtures";

const model: ModelVersion = {id: "trained-v1", name: "ridge", version: "1", status: "approved",
  artifactId: "artifact-v1", codeVersion: "test", featureSpec: {}, parameters: {}, metrics: null, trainingCutoff: null};
const context = {jobId: "job", leaseToken: "lease", signal: new AbortController().signal};
const jobRequest = () => ({...request(), dataPolicy: "history_only" as const, modelVersionId: model.id, configVersion: "config", eventKey: "event"});
// Contract double only: it is deliberately not a production model or approval artifact.
const predictor: ForecastInference = async (_request, snapshot) => snapshot.weatherValues.map(point => ({
  assetId: "turbine-1", targetTime: point.targetTime, value: point.value / 10,
  unit: "normalized", qualityFlag: "test_trained",
}));
function service(inference: ForecastInference, selectedModel = model) {
  const {data} = fixture();
  const store = new MemoryForecastStore();
  return {data, store, service: new ForecastService({async listAvailable() {return data.observations;}},
    {async listRuns() {return data.runs;}, async readValues(id) {return data.weatherValues.filter(row => row.runId === id);}},
    store, "config", selectedModel, inference)};
}
const sqlForModel = (selectedModel = model) => (async () => [{id: selectedModel.id, name: selectedModel.name,
  version: selectedModel.version, status: selectedModel.status, artifact_id: selectedModel.artifactId,
  code_version: selectedModel.codeVersion, feature_spec: {}, parameters: {}, metrics: null, training_cutoff: null}]) as unknown as ReturnType<typeof postgres>;

test("both synchronous service and production agent adapter use the injected predictor for 24/48 hours", async () => {
  for (const horizonHours of [24, 48] as const) {
    const f = service(predictor);
    const req = {...jobRequest(), horizonHours};
    const forecast = await f.service.run(req);
    assert.equal(forecast.status, "published");
    assert.equal(forecast.values.length, horizonHours);
    const ports = new PostgresAgentPorts(sqlForModel(), "config", undefined, undefined, predictor);
    const points = await ports.predict({request: req, features: {snapshot: forecast.snapshot}}, context);
    assert.deepEqual(points, forecast.values);
    assert.equal(points[0].value, 0.6);
    f.data.weatherValues.forEach(value => value.value = 8);
    assert.equal((await f.service.run(req)).values[0].value, 0.8);
  }
});

test("missing inputs, invalid points, candidate model and predictor errors cannot publish or fall back", async () => {
  let calls = 0;
  const f = service(async () => {calls++; throw new Error("CHECKSUM_MISMATCH");});
  await assert.rejects(f.service.run(jobRequest()), /CHECKSUM_MISMATCH/);
  assert.equal((await f.store.list()).length, 0);
  f.data.weatherValues = [];
  assert.equal((await f.service.run(jobRequest())).status, "incomplete");
  assert.equal(calls, 1);
  const invalid = service(async () => []);
  assert.equal((await invalid.service.run(jobRequest())).status, "incomplete");
  const candidate = service(predictor, {...model, status: "candidate"});
  await assert.rejects(candidate.service.run(jobRequest()), /MODEL_NOT_APPROVED/);
  const snapshot = (await fixture().service.run(request())).snapshot;
  await assert.rejects(baselineInference(jobRequest(), snapshot, model), /MODEL_INFERENCE_NOT_IMPLEMENTED/);
  const ports = new PostgresAgentPorts(sqlForModel({...model, status: "retired"}), "config", undefined, undefined, predictor);
  await assert.rejects(ports.predict({request: jobRequest(), features: {snapshot}}, context), /MODEL_NOT_APPROVED/);
});

test("trained snapshot retains temperature and heights from the selected read and hashes feature changes", async () => {
  const {data} = fixture();
  data.weatherValues.push(...data.weatherValues.map(row => ({...row, metric: "temperature", value: 15, unit: "°C", heightMetres: 2})));
  let reads = 0;
  const build = () => buildModelSnapshot(request(), {async listAvailable() {return data.observations;}},
    {async listRuns() {return data.runs;}, async readValues() {reads++; return data.weatherValues;}}, "config");
  const first = await build();
  assert.equal(reads, 1);
  assert.equal(first.weatherValues.length, 48);
  assert.equal(first.weatherValues.find(row => row.metric === "temperature")!.heightMetres, 2);
  data.weatherValues.filter(row => row.metric === "temperature").forEach(row => row.value = 20);
  assert.equal(first.weatherValues.find(row => row.metric === "temperature")!.value, 15);
  const second = await build();
  assert.notEqual(first.sha256, second.sha256);
  assert.ok(Object.isFrozen(first.weatherValues));
});

test("LLM on, off and failure preserve deterministic publication gates", async () => {
  const snapshot = (await fixture().service.run(request())).snapshot;
  const points = await predictor(jobRequest(), snapshot, model);
  const weather = {id: "weather", publishedAt: request().issuedAt, availableAt: request().issuedAt,
    targets: points.map(point => point.targetTime)};
  const observations = snapshot.observations;
  for (const mode of ["on", "off", "failure"]) {
    let published = 0;
    const ports = {decide: mode === "off" ? undefined : async () => {
      if (mode === "failure") throw new Error("unavailable");
      return {action: "use_primary", candidateId: weather.id, reasonCode: "VALID_INPUTS", reasonSummary: "valid",
        evidenceRefs: [weather.id], limitations: [], retryAfterSeconds: null};
    }, explain: mode === "off" ? undefined : async () => {
      if (mode === "failure") throw new Error("unavailable");
      return "Comparison only; causality not established.";
    }, publish: async () => { published++; return {id: "saved", version: 1}; }} as unknown as AgentPorts;
    let checkpoint: Record<string, unknown> = {weather, observations, points, comparison: {meanDelta: 0.1}};
    checkpoint = (await executeStep(ports, jobRequest(), 2, checkpoint, context)).checkpoint;
    checkpoint = (await executeStep(ports, jobRequest(), 6, checkpoint, context)).checkpoint;
    await executeStep(ports, jobRequest(), 7, checkpoint, context);
    assert.equal(published, 1);
    await assert.rejects(executeStep(ports, jobRequest(), 7, {...checkpoint, points: points.slice(1)}, context), /INCOMPLETE_FORECAST/);
    await assert.rejects(executeStep(ports, jobRequest(), 7, {...checkpoint, weather: {...weather, publishedAt: points[0].targetTime}}, context), /WEATHER_NOT_AVAILABLE/);
    assert.equal(published, 1);
  }
});
