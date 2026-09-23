import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import postgres from "postgres";
import {ForecastService} from "../../src/server/forecast/service";
import {PostgresForecastStore} from "../../src/server/forecast/postgres-store";
import {PostgresObservationReader, PostgresWeatherRunReader} from "../../src/server/data/snapshot/postgres-readers";
import {PostgresAgentPorts} from "../../src/server/agent/adapters";
import {PostgresJobStore} from "../../src/server/jobs/postgres-store";
import {JobRunner} from "../../src/server/jobs/runner";
import type {ModelVersion} from "../../src/server/contracts";

// Run only against the disposable, migrated P6 Compose database; never a production database.
test("PostgreSQL persistence works through synchronous publication and the real durable agent", {
  skip: !process.env.P6_TEST_DATABASE_URL,
}, async () => {
  const sql = postgres(process.env.P6_TEST_DATABASE_URL!, {max: 3});
  try {
    const asset = randomUUID(), raw = randomUUID(), modelId = randomUUID(), weather = randomUUID();
    const issue = "2026-01-31T12:00:00.000Z";
    await sql`INSERT INTO assets (id, kind, name) VALUES (${asset}, 'turbine', 'P6 synthetic runtime test')`;
    await sql`INSERT INTO raw_artifacts (id, sha256, path, source)
      VALUES (${raw}, ${"a".repeat(64)}, ${`fixture-${raw}`}, 'synthetic-test')`;
    await sql`INSERT INTO model_versions (id, name, version, status, code_version)
      VALUES (${modelId}, 'persistence', ${modelId}, 'approved', 'test')`;
    await sql`INSERT INTO observations (asset_id, metric, value, unit, event_time, available_at, revision, quality_flag)
      VALUES (${asset}, 'normalized_power', 0.42, 'normalized', ${issue}, ${issue}, 1, 'accepted')`;
    await sql`INSERT INTO weather_runs (id, asset_id, provider, run_time, published_at, available_at, raw_artifact_id)
      VALUES (${weather}, ${asset}, 'synthetic-test', ${issue}, ${issue}, ${issue}, ${raw})`;
    for (let lead = 1; lead <= 24; lead++) {
      const target = new Date(Date.parse(issue) + lead * 3_600_000).toISOString();
      await sql`INSERT INTO weather_values (run_id, target_time, metric, value, unit, height_metres)
        VALUES (${weather}, ${target}, 'wind_speed', 7, 'm/s', 100), (${weather}, ${target}, 'temperature', 10, '°C', 2)`;
    }
    const model: ModelVersion = {id: modelId, name: "persistence", version: modelId, status: "approved",
      artifactId: null, codeVersion: "test", featureSpec: {}, trainingCutoff: null, parameters: {}, metrics: null};
    const forecasts = new PostgresForecastStore(sql);
    const service = new ForecastService(new PostgresObservationReader(sql), new PostgresWeatherRunReader(sql), forecasts, "test", model);
    const request = {assetIds: [asset], issuedAt: issue, horizonHours: 24 as const, mode: "backtest" as const,
      modelVersionId: modelId, dataPolicy: "history_only" as const};
    const sync = await service.run(request);
    assert.equal(sync.values.length, 24);
    const store = new PostgresJobStore(sql);
    const payload = {...request, configVersion: "test", eventKey: randomUUID()};
    const job = await store.enqueue(payload.eventKey, payload, new Date().toISOString(), 3);
    const ports = new PostgresAgentPorts(sql, "test");
    const runner = new JobRunner(store, ports);
    for (let index = 0; index < 12; index++) {
      const current = await store.get(job.id);
      if (current?.status === "completed" || current?.status === "failed") break;
      await runner.tick();
    }
    const completed = await store.get(job.id);
    assert.equal(completed?.status, "completed", completed?.errorCode ?? undefined);
    const agent = (await forecasts.list({assetId: asset})).find(run => run.id === completed?.resultId)!;
    assert.deepEqual(agent.values, sync.values);
    assert.equal(agent.snapshot.weatherValues.length, 48);
    assert.equal(agent.snapshot.weatherValues.find(row => row.metric === "temperature")?.heightMetres, 2);
    assert.match(String((agent.snapshot.payload.agent as {briefing: string}).briefing), /причинное влияние признаков не установлено/);
    assert.equal((await store.events(job.id)).filter(event => event.kind === "fallback").length, 2);
  } finally { await sql.end({timeout: 5}); }
});
