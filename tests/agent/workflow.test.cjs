/* eslint-disable @typescript-eslint/no-require-imports -- test-only TypeScript loader uses CommonJS */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Compile the project's TypeScript with its installed compiler, without a test dependency.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  }}).outputText;
  module._compile(output, filename);
};

const { MemoryJobStore } = require('../../src/server/jobs/memory-store.ts');
const { JobRunner } = require('../../src/server/jobs/runner.ts');
const { triggerInput } = require('../../src/server/jobs/triggers.ts');
const { VirtualClock, revealReplayEvents } = require('../../src/server/replay/clock.ts');

const issue = '2026-01-31T00:00:00.000Z';
const date = (hours) => new Date(Date.parse(issue) + hours * 3_600_000).toISOString();
const request = { assetIds: ['line'], issuedAt: issue, horizonHours: 24, mode: 'live',
  modelVersionId: 'm1', configVersion: 'v1', dataPolicy: 'history_only' };
const weather = (id, availableAt = issue) => ({
  id, publishedAt: availableAt, availableAt,
  targets: Array.from({ length: 24 }, (_, i) => date(i + 1)),
});

function fixture() {
  const store = new MemoryJobStore();
  const clock = new VirtualClock(issue);
  const saved = new Map();
  let publishCalls = 0;
  let failAfterSave = false;
  const ports = {
    fetchWeatherRun: async (req) => weather(req.weatherRunId ?? 'w1'),
    listObservations: async () => [{ id: 'o1', revision: 1, eventTime: date(-1), availableAt: issue, value: 0.5 }],
    buildFeatures: async ({ weather }) => ({ weatherRunId: weather.id }),
    predict: async ({ request: req }) => Array.from({ length: req.horizonHours }, (_, i) =>
      ({ assetId: 'line', targetTime: date(i + 1), value: 0.5, unit: 'normalized' })),
    compareForecasts: async () => ({ meanDelta: 0.1 }),
    evaluateWhenActualsArrive: async () => null,
    explain: async () => { throw new Error('LLM unavailable'); },
    publish: async ({ request: req, publicationKey, points, weatherRun }) => {
      publishCalls++;
      if (!saved.has(publicationKey)) {
        saved.set(publicationKey, { id: `f${saved.size + 1}`, version: saved.size + 1,
          points, weatherRunId: weatherRun.id, mode: req.mode });
      }
      if (failAfterSave) { failAfterSave = false; throw new Error('response lost after commit'); }
      return saved.get(publicationKey);
    },
  };
  return { store, clock, ports, saved, get publishCalls() { return publishCalls; },
    failAfterSave: () => { failAfterSave = true; } };
}

async function drain(store, ports, clock, max = 30) {
  const runner = new JobRunner(store, ports, clock, { leaseMs: 10_000, retryBaseMs: 1_000 });
  for (let i = 0; i < max; i++) {
    const result = await runner.tick();
    if (!result) return;
    if (result.status === 'queued' && Date.parse(result.nextRunAt) > Date.parse(clock.now())) {
      clock.advance(result.nextRunAt);
    }
  }
  throw new Error('step budget exceeded');
}

test('new weather makes a new version; repeated event is idempotent; LLM failure gets template', async () => {
  const f = fixture();
  const first = await triggerInput(f.store, request, { id: 'evt1', kind: 'weather',
    availableAt: issue, weatherRunId: 'w1' }, issue);
  const duplicate = await triggerInput(f.store, request, { id: 'evt1', kind: 'weather',
    availableAt: issue, weatherRunId: 'w1' }, issue);
  assert.equal(first.id, duplicate.id);
  await drain(f.store, f.ports, f.clock);
  assert.equal((await f.store.get(first.id)).status, 'completed');
  assert.equal(f.saved.size, 1);
  const events = await f.store.events(first.id);
  assert.deepEqual(events.filter((item) => item.kind === 'fallback').map((item) => item.step),
    ['select_strategy', 'explain']);
  assert.equal(events.at(-1).step, 'publish');
  const second = await triggerInput(f.store, request, { id: 'evt2', kind: 'weather',
    availableAt: issue, weatherRunId: 'w2' }, issue);
  await drain(f.store, f.ports, f.clock);
  assert.equal((await f.store.get(second.id)).resultId, 'f2');
  assert.equal(f.saved.size, 2);
});

test('restart after committed publication does not create a second version', async () => {
  const f = fixture();
  const job = await triggerInput(f.store, request, { id: 'evt1', kind: 'weather',
    availableAt: issue, weatherRunId: 'w1' }, issue);
  f.failAfterSave();
  const beforeRestart = new JobRunner(f.store, f.ports, f.clock, { leaseMs: 10_000, retryBaseMs: 1_000 });
  for (let step = 0; step < 8; step++) await beforeRestart.tick();
  assert.equal(f.saved.size, 1);
  assert.equal((await f.store.get(job.id)).status, 'queued');
  f.clock.advance((await f.store.get(job.id)).nextRunAt);
  // New runner instance represents a restarted dispatcher/Next.js process.
  await drain(f.store, f.ports, f.clock);
  assert.equal((await f.store.get(job.id)).status, 'completed');
  assert.equal(f.saved.size, 1);
  assert.equal(f.publishCalls, 2);
});

test('concurrent claim, expired lease and stale token are fenced', async () => {
  const f = fixture();
  await triggerInput(f.store, request, { id: 'evt1', kind: 'weather',
    availableAt: issue, weatherRunId: 'w1' }, issue);
  const [one, two] = await Promise.all([f.store.claim(issue, 1000), f.store.claim(issue, 1000)]);
  assert.equal([one, two].filter(Boolean).length, 1);
  assert.equal(await f.store.heartbeat(one.id, one.leaseToken, issue, 1000), true);
  f.clock.advance(new Date(Date.parse(issue) + 1001).toISOString());
  const recovered = await f.store.claim(f.clock.now(), 1000);
  assert.equal(recovered.id, one.id);
  assert.notEqual(recovered.leaseToken, one.leaseToken);
  assert.equal(await f.store.advance(one.id, one.leaseToken, f.clock.now(), {}, 1), false);
});

test('repeated worker crashes exhaust the lease retry budget', async () => {
  const f = fixture();
  const job = await triggerInput(f.store, request, { id: 'evt1', kind: 'weather',
    availableAt: issue, weatherRunId: 'w1' }, issue, 2);
  await f.store.claim(issue, 1000);
  f.clock.advance(new Date(Date.parse(issue) + 1001).toISOString());
  await f.store.claim(f.clock.now(), 1000);
  f.clock.advance(new Date(Date.parse(f.clock.now()) + 1001).toISOString());
  assert.equal(await f.store.claim(f.clock.now(), 1000), null);
  assert.equal((await f.store.get(job.id)).errorCode, 'LEASE_EXHAUSTED');
});

test('future weather and future observations are rejected by code', async () => {
  const f = fixture();
  await assert.rejects(() => triggerInput(f.store, request, { id: 'future', kind: 'weather',
    availableAt: date(1), weatherRunId: 'future' }, issue), /EVENT_NOT_AVAILABLE/);
  f.ports.fetchWeatherRun = async () => weather('future', date(1));
  const job = await triggerInput(f.store, request, { id: 'evt1', kind: 'weather',
    availableAt: issue, weatherRunId: 'future' }, issue);
  await drain(f.store, f.ports, f.clock);
  assert.equal((await f.store.get(job.id)).errorCode, 'WEATHER_NOT_AVAILABLE_AT_ISSUE');
  assert.equal(f.saved.size, 0);

  const other = fixture();
  other.ports.listObservations = async () => [{ id: 'future-observation', revision: 1, eventTime: date(1),
    availableAt: date(1), value: 0.7 }];
  const observationJob = await triggerInput(other.store, request, { id: 'evt2', kind: 'observation',
    availableAt: issue }, issue);
  await drain(other.store, other.ports, other.clock);
  assert.equal((await other.store.get(observationJob.id)).errorCode, 'OBSERVATION_NOT_AVAILABLE_AT_ISSUE');
  assert.equal(other.saved.size, 0);
});

test('network retries stop at configured maximum', async () => {
  const f = fixture();
  f.ports.fetchWeatherRun = async () => { throw new Error('network'); };
  const job = await triggerInput(f.store, request, { id: 'evt1', kind: 'weather',
    availableAt: issue, weatherRunId: 'w1' }, issue, 3);
  await drain(f.store, f.ports, f.clock);
  assert.equal((await f.store.get(job.id)).status, 'failed');
  assert.equal((await f.store.get(job.id)).attempt, 3);
  assert.equal((await f.store.events(job.id)).filter((item) => item.kind === 'retry').length, 2);
});

test('replay reveals only due inputs and keeps forecasts in replay mode', async () => {
  const f = fixture();
  const events = [
    { id: 'e1', kind: 'weather', availableAt: issue, issuedAt: issue, weatherRunId: 'w1' },
    { id: 'e2', kind: 'weather', availableAt: date(2), issuedAt: date(2), weatherRunId: 'w2' },
  ];
  const common = { assetIds: ['line'], horizonHours: 24, modelVersionId: 'm1',
    configVersion: 'v1', dataPolicy: 'history_only' };
  assert.equal((await revealReplayEvents(f.store, f.clock, common, events)).length, 1);
  f.clock.advance(date(2));
  const revealed = await revealReplayEvents(f.store, f.clock, common, events);
  assert.equal(revealed.length, 2);
  assert.equal(revealed[1].payload.mode, 'replay');
  assert.equal(revealed[0].id, (await revealReplayEvents(f.store, f.clock, common, events))[0].id);
});
