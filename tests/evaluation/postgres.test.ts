import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile, readdir} from "node:fs/promises";
import test from "node:test";
import postgres from "postgres";
import {importEvaluationActuals} from "../../src/server/evaluation/actuals";
import {evaluatePublishedForecasts} from "../../src/server/evaluation/worker";
import {assetId, manifest} from "./fixtures";

// Explicit disposable URL only; isolated schema is created/dropped by this test.
test("PostgreSQL: migrations, revisions, idempotency, rollback and target isolation", {skip: !process.env.P5_TEST_DATABASE_URL}, async () => {
  const schema = `p5_test_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(process.env.P5_TEST_DATABASE_URL!, {max: 1, onnotice: () => {}});
  const sql = postgres(process.env.P5_TEST_DATABASE_URL!, {max: 3,
    connection: {search_path: `${schema}, public`}, onnotice: () => {}});
  try {
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    const directory = "src/server/db/migrations";
    for (const name of (await readdir(directory)).filter((name) => name.endsWith(".sql") && !name.startsWith("0105_p5_")).sort()) {
      await sql.begin(async (tx) => { await tx.unsafe(await readFile(`${directory}/${name}`, "utf8")); });
    }
    await sql`INSERT INTO assets (id, kind, name) VALUES (${assetId}, 'turbine', 'P5 synthetic fixture')`;
    const model = randomUUID(), snapshot = randomUUID(), run = randomUUID();
    await sql`INSERT INTO model_versions (id, name, version, status, code_version)
      VALUES (${model}, 'fixture', '1', 'approved', 'fixture')`;
    const observation = {id: randomUUID(), assetId, metric: "normalized_power", value: 0.1, unit: "normalized",
      eventTime: "2026-01-31T22:00:00.000Z", availableAt: "2026-01-31T22:10:00.000Z", revision: 1, qualityFlag: "accepted"};
    await sql`INSERT INTO input_snapshots (id, issued_at, asset_ids, observation_revisions, weather_run_ids,
      payload, config_version, sha256) VALUES (${snapshot}, '2026-01-31T23:00:00Z', ${sql.array([assetId], 2950)},
      '[]', '{}', ${sql.json({observations: [observation]})}, 'fixture', ${"b".repeat(64)})`;
    async function publication(id: string, version: number, issue = "2026-01-31T23:00:00.000Z") {
      await sql`INSERT INTO forecast_runs (id, issued_at, asset_ids, horizon_hours, mode, data_policy,
        input_snapshot_id, model_version_id, status, version, published_at)
        VALUES (${id}, ${issue}, ${sql.array([assetId], 2950)}, 24, 'replay', 'history_only',
        ${snapshot}, ${model}, 'published', ${version}, now())`;
      for (let lead = 1; lead <= 24; lead++) {
        await sql`INSERT INTO forecast_values (forecast_run_id, asset_id, target_time, value, unit)
          VALUES (${id}, ${assetId}, ${new Date(Date.parse(issue) + lead * 3_600_000).toISOString()}, 0.2, 'normalized')`;
      }
    }
    await publication(run, 1);
    // Upgrade a populated pre-P5 schema, preserving existing forecasts and evaluations.
    const legacy = randomUUID();
    await sql`INSERT INTO evaluation_runs (id, forecast_run_ids, window_start, window_end, data_policy, status)
      VALUES (${legacy}, ${sql.array([run], 2950)}, '2026-02-01', '2026-03-01', 'evaluation_only', 'completed')`;
    await sql.begin(async (tx) => { await tx.unsafe(await readFile(`${directory}/0105_p5_evaluation.sql`, "utf8")); });
    assert.equal((await sql`SELECT id FROM evaluation_runs WHERE id = ${legacy}`)[0].id, legacy);
    const request = {forecastRunIds: [run, run], calendarTimezone: "UTC", manifest: manifest()};
    const before = await sql`SELECT row_to_json(f) AS data FROM forecast_runs f`;
    const snapshotsBefore = await sql`SELECT row_to_json(s) AS data FROM input_snapshots s`;
    const valuesBefore = await sql`SELECT row_to_json(v) AS data FROM forecast_values v ORDER BY target_time`;
    const modelsBefore = await sql`SELECT row_to_json(m) AS data FROM model_versions m`;
    const empty = await evaluatePublishedForecasts(sql, request);
    assert.equal(empty.version, 1);
    assert.equal(empty.report.evaluatedPairCount, 0);
    assert.equal(empty.report.metrics[0].model, null);
    await assert.rejects(evaluatePublishedForecasts(sql, {...request, calendarTimezone: "Asia/Almaty"}), /MISMATCH/);
    const bundle = {source: "synthetic test fixture", sourceSha256: "a".repeat(64), manifest: manifest(),
      rows: [{assetId, targetTime: "2026-02-01T00:00:00.000Z", value: 0.4, unit: "normalized"}]};
    const imported = await importEvaluationActuals(sql, bundle);
    assert.equal((await importEvaluationActuals(sql, bundle)).batchId, imported.batchId);
    const creationRace = await Promise.all([evaluatePublishedForecasts(sql, request), evaluatePublishedForecasts(sql, request)]);
    assert.equal(creationRace[0].report.id, creationRace[1].report.id);
    assert.deepEqual(creationRace.map((r) => r.reused).sort(), [false, true]);
    const first = creationRace[0];
    assert.equal(first.version, 2);
    assert.equal(first.report.metrics[0].model?.mae, 0.2);
    assert.equal(first.report.coverage, 1 / 24);
    assert.equal(first.report.metrics[0].comparison?.baseline.n, first.report.metrics[0].comparison?.model.n);
    const concurrent = await Promise.all([evaluatePublishedForecasts(sql, request), evaluatePublishedForecasts(sql, request)]);
    assert.ok(concurrent.every((r) => r.reused && r.report.id === first.report.id));
    await importEvaluationActuals(sql, {...bundle, sourceSha256: "c".repeat(64), rows: [{...bundle.rows[0], value: 0.8}]});
    const corrected = await evaluatePublishedForecasts(sql, request);
    assert.equal(corrected.version, 3);
    assert.ok(Math.abs(corrected.report.metrics[0].model!.mae - 0.6) < 1e-12);
    const saved = await sql`SELECT p5_report FROM evaluation_runs WHERE id = ${first.report.id}`;
    assert.equal(saved[0].p5_report.metrics[0].model.mae, 0.2);
    assert.deepEqual(await sql`SELECT row_to_json(f) AS data FROM forecast_runs f`, before);
    assert.deepEqual(await sql`SELECT row_to_json(s) AS data FROM input_snapshots s`, snapshotsBefore);
    assert.deepEqual(await sql`SELECT row_to_json(v) AS data FROM forecast_values v ORDER BY target_time`, valuesBefore);
    assert.deepEqual(await sql`SELECT row_to_json(m) AS data FROM model_versions m`, modelsBefore);
    assert.equal((await sql`SELECT count(*)::int n FROM observations`)[0].n, 0);
    assert.equal((await sql`SELECT count(*)::int n FROM observation`)[0].n, 0);
    await assert.rejects(sql`UPDATE evaluation_actuals SET value = 0`, /immutable/);
    const batchCount = (await sql`SELECT count(*)::int n FROM evaluation_actual_batches`)[0].n;
    const invalidAsset = randomUUID();
    const invalidManifest = manifest();
    if (invalidManifest.mapping.status === "confirmed") invalidManifest.mapping.value.push({sourceSeries: "missing", assetId: invalidAsset});
    await assert.rejects(importEvaluationActuals(sql, {...bundle, manifest: invalidManifest,
      rows: [...bundle.rows, {...bundle.rows[0], assetId: invalidAsset}]}), /foreign key/);
    assert.equal((await sql`SELECT count(*)::int n FROM evaluation_actual_batches`)[0].n, batchCount);
    const next = randomUUID(); await publication(next, 2);
    const selected = await evaluatePublishedForecasts(sql, {...request, forecastRunIds: [run, next, next]});
    assert.equal(selected.report.eligiblePairCount, 24);
    assert.ok(selected.report.exclusions.every((e) => e.forecastRunId === next));
    await sql`UPDATE forecast_runs SET mode = 'live' WHERE id = ${next}`;
    await assert.rejects(evaluatePublishedForecasts(sql, {...request, forecastRunIds: [run, next]}), /MIXED/);
    await sql`UPDATE forecast_runs SET mode = 'replay', status = 'incomplete' WHERE id = ${next}`;
    await assert.rejects(evaluatePublishedForecasts(sql, {...request, forecastRunIds: [next]}), /PUBLISHED/);
    const tail = randomUUID(); await publication(tail, 1, "2026-02-28T22:00:00.000Z");
    const march = await evaluatePublishedForecasts(sql, {...request, forecastRunIds: [tail]});
    assert.equal(march.report.eligiblePairCount, 1);
    assert.equal(march.report.exclusions.filter((e) => e.reason === "outside_evaluation_period").length, 23);
    const alternate = manifest();
    alternate.normalization = {status: "confirmed", value: "other fixture scale", source: "synthetic correction"};
    await importEvaluationActuals(sql, {...bundle, manifest: alternate});
    assert.equal((await evaluatePublishedForecasts(sql, request)).report.evaluatedPairCount, 0);
    // A null correction explicitly retracts the last actual; never falls back to an older revision.
    await importEvaluationActuals(sql, {...bundle, rows: [{...bundle.rows[0], value: null}]});
    assert.equal((await evaluatePublishedForecasts(sql, request)).report.evaluatedPairCount, 0);
    await assert.rejects(evaluatePublishedForecasts(sql, {...request, forecastRunIds: [randomUUID()]}), /PUBLISHED/);
  } finally {
    await sql.end();
    await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
