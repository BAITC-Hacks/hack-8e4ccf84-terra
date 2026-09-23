/* eslint-disable @typescript-eslint/no-require-imports -- test-only TypeScript loader uses CommonJS */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);

const { MemoryJobStore } = require('../../src/server/jobs/memory-store.ts');
const { JobRunner } = require('../../src/server/jobs/runner.ts');
const { validateInputs } = require('../../src/server/agent/workflow.ts');

const now = '2026-01-31T00:00:00.000Z';
const payload = { assetIds: ['asset'], issuedAt: now, horizonHours: 24, mode: 'live',
  modelVersionId: 'model', configVersion: 'v1', dataPolicy: 'history_only', eventKey: 'event' };
const targets = Array.from({ length: 24 }, (_, index) =>
  new Date(Date.parse(now) + (index + 1) * 3_600_000).toISOString());

test('queued cancellation is idempotent and prevents claim', async () => {
  const store = new MemoryJobStore();
  const job = await store.enqueue('event', payload, now, 3);
  assert.equal((await store.cancel(job.id, now)).status, 'cancelled');
  assert.equal((await store.cancel(job.id, now)).status, 'cancelled');
  assert.equal(await store.claim(now, 10_000), null);
});

test('event failure cannot leave an advanced checkpoint', async () => {
  class FailingStore extends MemoryJobStore {
    async appendEvent(event) {
      if (event.kind === 'completed') throw new Error('journal unavailable');
      return super.appendEvent(event);
    }
  }
  const store = new FailingStore();
  const job = await store.enqueue('event', payload, now, 1);
  const claimed = await store.claim(now, 10_000);
  await assert.rejects(() => store.advance(job.id, claimed.leaseToken, now, { unsafe: true }, 1,
    undefined, { jobId: job.id, step: 'test', kind: 'completed', reason: 'done', details: {}, createdAt: now }));
  assert.equal((await store.get(job.id)).step, 0);
  assert.deepEqual((await store.get(job.id)).checkpoint, {});
});

test('heartbeat rejection is contained and worker does not advance', async () => {
  class HeartbeatStore extends MemoryJobStore { async heartbeat() { throw new Error('db down'); } }
  const store = new HeartbeatStore();
  const job = await store.enqueue('event', payload, now, 2);
  const weather = { id: 'weather', availableAt: now, publishedAt: now, targets };
  const ports = { fetchWeatherRun: async () => { await new Promise((resolve) => setTimeout(resolve, 150)); return weather; },
    listObservations: async () => [], buildFeatures: async () => ({}), predict: async () => [],
    compareForecasts: async () => ({}), evaluateWhenActualsArrive: async () => null,
    publish: async () => { throw new Error('not reached'); } };
  const runner = new JobRunner(store, ports, { now: () => now }, { leaseMs: 300, retryBaseMs: 1 });
  await runner.tick();
  const saved = await store.get(job.id);
  assert.equal(saved.step, 0);
  assert.equal(saved.errorCode, 'HEARTBEAT_FAILED');
});

test('unknown forecast input units and evaluation-only observations are rejected', () => {
  const weather = { id: 'weather', availableAt: now, publishedAt: now, targets,
    assetIds: ['asset'], coverage: 1, values: targets.map((targetTime) => ({ assetId: 'asset',
      targetTime, metric: 'wind_speed', value: 5, unit: 'km/h' })) };
  assert.throws(() => validateInputs(payload, weather, []), /INVALID_WEATHER_VALUES/);
  assert.throws(() => validateInputs(payload, { ...weather,
    values: weather.values.map((value) => ({ ...value, unit: 'm/s' })) }, [{ id: 'truth', revision: 1,
      eventTime: now, availableAt: now, value: 0.5, assetId: 'asset', metric: 'normalized_power',
      unit: 'normalized', qualityFlag: 'accepted', dataUse: 'evaluation_only' }]),
  /EVALUATION_DATA_FORBIDDEN/);
});

test('an LLM cannot select a candidate outside the server allowlist', async () => {
  const store = new MemoryJobStore();
  const job = await store.enqueue('event', payload, now, 1);
  let featureCalls = 0;
  const ports = { fetchWeatherRun: async () => ({ id: 'allowed', availableAt: now,
    publishedAt: now, targets }), listObservations: async () => [],
    decide: async () => ({ action: 'use_primary', candidateId: 'foreign', reasonCode: 'MODEL_CHOICE',
      reasonSummary: 'untrusted', evidenceRefs: ['foreign'], limitations: [], retryAfterSeconds: null }),
    buildFeatures: async () => { featureCalls++; return {}; }, predict: async () => [],
    compareForecasts: async () => ({}), evaluateWhenActualsArrive: async () => null,
    publish: async () => { throw new Error('not reached'); } };
  const runner = new JobRunner(store, ports, { now: () => now }, { leaseMs: 10_000 });
  for (let index = 0; index < 3; index++) await runner.tick();
  assert.equal((await store.get(job.id)).errorCode, 'INVALID_AGENT_CANDIDATE');
  assert.equal(featureCalls, 0);
});
