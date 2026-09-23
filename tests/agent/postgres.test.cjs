/* eslint-disable @typescript-eslint/no-require-imports -- test-only TypeScript loader uses CommonJS */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const postgres = require('postgres');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  }}).outputText, filename);
};
const { PostgresJobStore } = require('../../src/server/jobs/postgres-store.ts');
const { PostgresReplayStore } = require('../../src/server/replay/store.ts');

const url = process.env.TEST_DATABASE_URL;
test('PostgreSQL claim, fencing, checkpoint and restart on S01 jobs schema', { skip: !url }, async () => {
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname), 'test database must be local');
  assert.match(parsed.pathname, /test/i, 'test database name must contain "test"');
  const sql = postgres(url, { max: 3 });
  try {
    for (const name of ['0001_foundation.sql', '0002_agent_replay.sql']) {
      await sql.unsafe(fs.readFileSync(path.join(__dirname, '../../src/server/db/migrations', name), 'utf8'));
    }
    await sql`TRUNCATE replay_input_events, replay_sessions, agent_events, jobs CASCADE`;
    const store = new PostgresJobStore(sql);
    const now = '2026-01-31T00:00:00.000Z';
    const payload = { assetIds: ['line'], issuedAt: now, horizonHours: 24, mode: 'replay',
      modelVersionId: 'm1', configVersion: 'v1', dataPolicy: 'history_only',
      eventKey: 'event-1', weatherRunId: 'w1' };
    const job = await store.enqueue('event-1', payload, now, 2);
    assert.equal((await store.enqueue('event-1', payload, now, 2)).id, job.id);
    await assert.rejects(() => store.enqueue('event-1', { ...payload, weatherRunId: 'w2' }, now, 2),
      /IDEMPOTENCY_CONFLICT/);
    const [one, two] = await Promise.all([store.claim(now, 1000), store.claim(now, 1000)]);
    assert.equal([one, two].filter(Boolean).length, 1);
    assert.equal(one.id, job.id);
    const restartedStore = new PostgresJobStore(sql);
    assert.equal((await restartedStore.get(job.id)).checkpoint.eventKey, undefined);
    assert.equal(await restartedStore.heartbeat(job.id, one.leaseToken, now, 1000), true);
    const afterLease = new Date(Date.parse(now) + 1001).toISOString();
    const recovered = await restartedStore.claim(afterLease, 1000);
    assert.equal(recovered.id, job.id);
    assert.notEqual(recovered.leaseToken, one.leaseToken);
    assert.equal(await store.advance(job.id, one.leaseToken, afterLease, {}, 1), false);
    assert.equal(await restartedStore.advance(job.id, recovered.leaseToken, afterLease,
      { weather: 'w1' }, 1, undefined, { jobId: job.id, step: 'fetch_weather_run',
        kind: 'completed', reason: 'fetched', details: { runId: 'w1' }, createdAt: afterLease }), true);
    assert.deepEqual((await store.get(job.id)).checkpoint, { weather: 'w1' });
    const event = (await restartedStore.events(job.id))[0];
    assert.equal(event.sequence, 1);
    assert.equal((await restartedStore.events(job.id))[0].reason, 'fetched');
    assert.equal((await restartedStore.cancel(job.id, afterLease)).status, 'cancelled');

    const [asset] = await sql`INSERT INTO assets (kind, name) VALUES ('turbine', 'Replay turbine') RETURNING id`;
    const [artifact] = await sql`INSERT INTO raw_artifacts (sha256, path, source)
      VALUES (${'a'.repeat(64)}, '/test/weather.json', 'test') RETURNING id`;
    const [runOne] = await sql`INSERT INTO weather_runs (asset_id, provider, published_at, available_at,
      raw_artifact_id) VALUES (${asset.id}, 'test', ${now}, ${now}, ${artifact.id}) RETURNING id`;
    const twoHours = new Date(Date.parse(now) + 2 * 3_600_000).toISOString();
    const replay = new PostgresReplayStore(sql);
    const session = await replay.create({ assetIds: [asset.id], horizonHours: 24,
      modelVersionId: '00000000-0000-0000-0000-000000000001', configVersion: 'v1',
      dataPolicy: 'history_only' }, now, [
      { id: 'event-1', availableAt: now, issuedAt: now, weatherRunId: runOne.id },
      { id: 'event-2', availableAt: twoHours, issuedAt: twoHours, weatherRunId: runOne.id },
    ]);
    const firstAdvance = await replay.advance(session.id, now, now);
    assert.equal(firstAdvance.jobIds.length, 1);
    const restartedReplay = new PostgresReplayStore(sql);
    const secondAdvance = await restartedReplay.advance(session.id, twoHours, twoHours);
    assert.equal(secondAdvance.jobIds.length, 1);
    assert.equal(secondAdvance.session.cursor, 2);
    const repeated = await restartedReplay.advance(session.id, twoHours, twoHours);
    assert.deepEqual(repeated.jobIds, []);
    assert.equal((await restartedReplay.get(session.id)).cursor, 2);
  } finally {
    await sql.end();
  }
});
