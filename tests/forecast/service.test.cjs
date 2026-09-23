/* eslint-disable @typescript-eslint/no-require-imports */
require("./register-ts.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {validateForecastValues} = require("../../src/server/forecast/service.ts");
const {fixture, target, request} = require("./fixtures.ts");

test("publishes exactly 24 and 48 distinct hourly points, with stable retries", async () => {
  const {service, store} = fixture();
  const one = await service.run(request());
  const retry = await service.run(request());
  const longer = await service.run(request(48));
  assert.equal(one.status, "published");
  assert.equal(one.values.length, 24);
  assert.equal(one.values[0].targetTime, target(1));
  assert.equal(one.values.at(-1).targetTime, target(24));
  assert.deepEqual(one.values.map((v) => v.value), Array(24).fill(0.39));
  assert.equal(retry.id, one.id);
  assert.equal(longer.values.length, 48);
  assert.equal((await store.list()).length, 2);
});

test("new eligible weather run creates version; future run and future fact cannot alter old forecast", async () => {
  const {service, data, store} = fixture();
  const first = await service.run(request());
  data.observations.push({...data.observations[0], id: "future", value: 0.99,
    eventTime: target(1), availableAt: target(2), revision: 2});
  data.runs.push({...data.runs[0], id: "future-run", availableAt: target(1), publishedAt: target(1)});
  data.weatherValues.push(...Array.from({length: 24}, (_, i) => ({...data.weatherValues[i], runId: "future-run"})));
  assert.equal((await service.run(request())).id, first.id);
  data.runs.push({...data.runs[0], id: "weather-2", availableAt: "2026-01-31T11:00:00.000Z"});
  data.weatherValues.push(...Array.from({length: 24}, (_, i) => ({...data.weatherValues[i], runId: "weather-2"})));
  const second = await service.run(request());
  assert.equal(second.version, 2);
  assert.equal(second.previousVersionId, first.id);
  assert.equal(second.snapshot.weatherRunIds[0], "weather-2");
  assert.equal(first.values[0].value, 0.39);
  assert.equal((await store.list())[0].values[0].value, 0.39);
});

test("missing weather hour produces explicit incomplete status and no published points", async () => {
  const {service, data} = fixture();
  data.weatherValues = data.weatherValues.filter((v) => v.targetTime !== target(12));
  const result = await service.run(request());
  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.values, []);
  assert.ok(result.incompleteReasons.includes("weather:turbine-1"));
});

test("future-only or unknown-availability observation cannot seed persistence", async () => {
  const {service, data} = fixture();
  data.observations[0].availableAt = null;
  data.observations.push({...data.observations[0], id: "future", eventTime: target(1),
    availableAt: target(1)});
  const result = await service.run(request());
  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.values, []);
  assert.ok(result.incompleteReasons.includes("observation:turbine-1"));
});

test("snapshot is detached from mutable reader rows and rejects duplicate points", async () => {
  const {service, data} = fixture();
  const result = await service.run(request());
  data.observations[0].value = 0.88;
  data.weatherValues[0].value = 99;
  assert.equal(result.snapshot.observations[0].value, 0.39);
  assert.equal(result.snapshot.weatherValues[0].value, 6);
  assert.ok(validateForecastValues(request(), [...result.values.slice(1), result.values[1]])
    .includes("points:turbine-1"));
});

test("evaluation-only policy is unavailable to forecast production", async () => {
  const {service} = fixture();
  await assert.rejects(service.run({...request(), dataPolicy: "evaluation_only"}),
    /EVALUATION_DATA_FORBIDDEN/);
});
