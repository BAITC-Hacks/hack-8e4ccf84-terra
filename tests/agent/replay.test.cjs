/* eslint-disable @typescript-eslint/no-require-imports -- test-only TypeScript loader uses CommonJS */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { MemoryJobStore } = require('../../src/server/jobs/memory-store.ts');
const { VirtualClock, revealReplayEvents } = require('../../src/server/replay/clock.ts');

test('replay reveal is monotonic, isolated and idempotent', async () => {
  const start = '2026-01-31T00:00:00.000Z';
  const later = '2026-01-31T02:00:00.000Z';
  const store = new MemoryJobStore();
  const clock = new VirtualClock(start);
  const request = { assetIds: ['asset'], horizonHours: 24, modelVersionId: 'model',
    configVersion: 'v1', dataPolicy: 'history_only' };
  const events = [{ id: 'one', kind: 'weather', availableAt: start, issuedAt: start, weatherRunId: 'w1' },
    { id: 'two', kind: 'weather', availableAt: later, issuedAt: later, weatherRunId: 'w2' }];
  assert.equal((await revealReplayEvents(store, clock, request, events)).length, 1);
  assert.throws(() => clock.advance('2026-01-30T23:00:00.000Z'), /TIME_REVERSAL/);
  clock.advance(later);
  const once = await revealReplayEvents(store, clock, request, events);
  const twice = await revealReplayEvents(store, clock, request, events);
  assert.deepEqual(once.map((job) => job.id), twice.map((job) => job.id));
  assert.ok(once.every((job) => job.payload.mode === 'replay'));
});
