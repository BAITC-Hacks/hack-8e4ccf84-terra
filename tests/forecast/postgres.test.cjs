/* eslint-disable @typescript-eslint/no-require-imports */
require("./register-ts.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const postgres = require("postgres");
const {randomUUID} = require("node:crypto");
const {ForecastService} = require("../../src/server/forecast/service.ts");
const {PostgresForecastStore} = require("../../src/server/forecast/postgres-store.ts");
const {PostgresObservationReader, PostgresWeatherRunReader} =
  require("../../src/server/data/snapshot/postgres-readers.ts");

test("PostgreSQL publication is atomic, versioned, and idempotent", {
  skip: !process.env.S04_TEST_DATABASE_URL,
}, async () => {
  const sql = postgres(process.env.S04_TEST_DATABASE_URL, {max: 2});
  try {
    const assetId = randomUUID();
    const rawId = randomUUID();
    const modelId = randomUUID();
    const weatherId = randomUUID();
    const issuedAt = "2026-01-31T12:00:00.000Z";
    const targets = Array.from({length: 24}, (_, i) =>
      new Date(Date.parse(issuedAt) + (i + 1) * 3_600_000).toISOString());
    await sql`INSERT INTO assets (id, kind, name) VALUES (${assetId}, 'turbine', 'S04 fixture')`;
    await sql`INSERT INTO raw_artifacts (id, sha256, path, source)
      VALUES (${rawId}, ${"a".repeat(64)}, ${`fixture-${rawId}`}, 'fixture')`;
    await sql`INSERT INTO model_versions (id, name, version, status, code_version)
      VALUES (${modelId}, 'persistence', ${modelId}, 'approved', 'fixture-v1')`;
    await sql`INSERT INTO observations (asset_id, metric, value, unit, event_time,
      available_at, revision, quality_flag)
      VALUES (${assetId}, 'normalized_power', 0.42, 'normalized',
        '2026-01-31T11:00:00Z', ${issuedAt}, 1, 'accepted')`;
    await sql`INSERT INTO weather_runs (id, asset_id, provider, run_time,
      published_at, available_at, raw_artifact_id)
      VALUES (${weatherId}, ${assetId}, 'fixture', '2026-01-31T09:00:00Z',
        '2026-01-31T10:00:00Z', '2026-01-31T10:00:00Z', ${rawId})`;
    for (const target of targets) {
      await sql`INSERT INTO weather_values (run_id, target_time, metric, value, unit)
        VALUES (${weatherId}, ${target}, 'wind_speed', 7, 'm/s')`;
    }
    const model = {id: modelId, name: "persistence", status: "approved"};
    const store = new PostgresForecastStore(sql);
    const service = new ForecastService(new PostgresObservationReader(sql),
      new PostgresWeatherRunReader(sql), store, "fixture-config", model);
    const request = {assetIds: [assetId], issuedAt, horizonHours: 24,
      mode: "backtest", modelVersionId: modelId, dataPolicy: "history_only"};
    const first = await service.run(request);
    assert.equal(first.status, "published");
    assert.equal(first.values.length, 24);
    const retry = await service.run(request);
    assert.equal(retry.id, first.id);
    assert.equal(retry.snapshot.observations[0].value, 0.42);

    const newerRun = randomUUID();
    await sql`INSERT INTO weather_runs (id, asset_id, provider, run_time,
      published_at, available_at, raw_artifact_id)
      VALUES (${newerRun}, ${assetId}, 'fixture', '2026-01-31T10:00:00Z',
        '2026-01-31T11:00:00Z', '2026-01-31T11:00:00Z', ${rawId})`;
    for (const target of targets) {
      await sql`INSERT INTO weather_values (run_id, target_time, metric, value, unit)
        VALUES (${newerRun}, ${target}, 'wind_speed', 8, 'm/s')`;
    }
    const second = await service.run(request);
    assert.equal(second.version, 2);
    assert.equal(second.previousVersionId, first.id);
    await sql`INSERT INTO observations (asset_id, metric, value, unit, event_time,
      available_at, revision, quality_flag)
      VALUES (${assetId}, 'normalized_power', 0.99, 'normalized',
        ${targets[0]}, ${targets[1]}, 1, 'accepted')`;
    assert.equal((await service.run(request)).id, second.id);
    const before = await sql`SELECT count(*)::int AS n FROM forecast_runs WHERE issued_at = ${issuedAt}`;
    await sql.unsafe(`CREATE FUNCTION s04_fail_second() RETURNS trigger AS $$
      BEGIN
        IF NEW.target_time = '2026-01-31T14:00:00Z'::timestamptz THEN
          RAISE EXCEPTION 'forced fixture failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    await sql.unsafe(`CREATE TRIGGER s04_fail_second_trigger BEFORE INSERT ON forecast_values
      FOR EACH ROW EXECUTE FUNCTION s04_fail_second()`);
    try {
      await assert.rejects(store.publish({...second, idempotencyKey: randomUUID(),
        values: second.values}), /forced fixture failure/);
    } finally {
      await sql.unsafe("DROP TRIGGER s04_fail_second_trigger ON forecast_values");
      await sql.unsafe("DROP FUNCTION s04_fail_second()");
    }
    const after = await sql`SELECT count(*)::int AS n FROM forecast_runs WHERE issued_at = ${issuedAt}`;
    assert.equal(after[0].n, before[0].n);
    assert.equal((await store.list({assetId})).length, 2);
  } finally {
    await sql.end();
  }
});
