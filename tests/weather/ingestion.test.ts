import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { OpenMeteoWeather } from "../../src/server/connectors/weather/open-meteo";
import { canonicalWeatherValues, PostgresWeatherIngestion } from "../../src/server/connectors/weather/ingestion";
import { PostgresAgentPorts } from "../../src/server/agent/adapters";
import type { SavedWeatherRun } from "../../src/server/connectors/weather/types";
import type { JobPayload } from "../../src/server/jobs/types";

const raw = readFileSync(new URL("./evidence/feb-start.raw.json", import.meta.url));
const config = { latitude: 43.25, longitude: 76.95, availability: { kind: "observed" as const } };
const issue = "2026-02-01T12:00:00.000Z";
async function fixture(http: typeof fetch = async () => new Response(raw)) {
  return new OpenMeteoWeather(config, http, () => new Date("2026-09-23T00:00:00Z"))
    .fetch_run("2026-02-01T00:00:00.000Z", "2026-09-23T01:00:00.000Z");
}
function changed(run: SavedWeatherRun, mutate: (data: typeof dataShape) => void) {
  const data = JSON.parse(raw.toString()) as typeof dataShape;
  mutate(data);
  const bytes = Buffer.from(JSON.stringify(data));
  return { ...run, raw_base64: bytes.toString("base64"), sha256: createHash("sha256").update(bytes).digest("hex") };
}
const dataShape = { latitude: 0, longitude: 0, hourly_units: { wind_speed_100m: "" },
  hourly: { time: [""], wind_speed_100m: [0] } };

test("canonical hourly mapping preserves height, raw hash, 24/48 coverage and rejects malformed archives", async () => {
  const run = await fixture();
  for (const horizon of [24, 48] as const) {
    const values = canonicalWeatherValues(run, issue, horizon);
    assert.equal(values.length, 480);
    assert.equal(values.filter(v => v.metric === "wind_speed").length, 120);
    assert.equal(values.find(v => v.metric === "wind_speed")?.heightMetres, 100);
  }
  for (const mutate of [
    (d: typeof dataShape) => { d.latitude = 0; },
    (d: typeof dataShape) => { d.hourly_units.wind_speed_100m = "km/h"; },
    (d: typeof dataShape) => { d.hourly.time[2] = d.hourly.time[1]; },
    (d: typeof dataShape) => { d.hourly.wind_speed_100m.pop(); },
    (d: typeof dataShape) => { d.hourly.wind_speed_100m[0] = -1; },
  ]) assert.throws(() => canonicalWeatherValues(changed(run, mutate), issue, 48));
  assert.throws(() => canonicalWeatherValues({ ...run, sha256: "0".repeat(64) }, issue, 24), /hash mismatch/);
  assert.throws(() => canonicalWeatherValues(run, "2026-02-05T12:00:00.000Z", 48), /complete requested horizon/);
  assert.throws(() => canonicalWeatherValues(run, "2026-01-31T12:00:00.000Z", 24), /Expected an archived/);
});

test("provider retries transient errors only, is bounded and sanitizes failures", async () => {
  let calls = 0;
  await fixture(async () => ++calls < 3 ? new Response("temporary", { status: 503 }) : new Response(raw));
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(fixture(async () => { calls++; return new Response("private", { status: 400 }); }), /unavailable or access/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(fixture(async () => { calls++; throw new Error("private"); }), /three attempts/);
  assert.equal(calls, 3);
});

const url = process.env.TEST_DATABASE_URL;
test("PostgreSQL atomic rollback, visibility, concurrent idempotency, restart and canonical consumer gates", { skip: !url }, async () => {
  const parsed = new URL(url!);
  assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname));
  assert.match(parsed.pathname, /test/);
  const sql = postgres(url!, { max: 4 });
  try {
    // Requires a fresh disposable database, never truncates a shared schema.
    await sql.unsafe(readFileSync(new URL("../../src/server/db/migrations/0001_foundation.sql", import.meta.url), "utf8"));
    const [asset] = await sql`INSERT INTO assets (kind, name, latitude, longitude)
      VALUES ('turbine', 'SYNTHETIC P1 TEST', 43.25, 76.95) RETURNING id`;
    const run = await fixture();
    const store = new PostgresWeatherIngestion(sql);
    await sql.unsafe(`CREATE FUNCTION p1_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$;
      CREATE TRIGGER p1_fail BEFORE INSERT ON weather_values FOR EACH ROW EXECUTE FUNCTION p1_fail();`);
    await assert.rejects(store.save(asset.id, run, issue, 48), /test rollback/);
    for (const table of ["raw_artifacts", "weather_runs", "weather_values"])
      assert.equal(Number((await sql.unsafe(`SELECT count(*) AS n FROM ${table}`))[0].n), 0);
    await sql.unsafe("DROP TRIGGER p1_fail ON weather_values; DROP FUNCTION p1_fail()");
    // Hold the writer inside the last stage; the independent connection cannot see a partial run/raw.
    await sql.unsafe(`CREATE FUNCTION p1_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10101); RETURN NEW; END $$;
      CREATE TRIGGER p1_pause BEFORE INSERT ON weather_values FOR EACH STATEMENT EXECUTE FUNCTION p1_pause();`);
    const lock = await sql.reserve();
    await lock`SELECT pg_advisory_lock(10101)`;
    const writing = store.save(asset.id, run, issue, 48);
    try {
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        waiting = Number((await sql`SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`)[0].n) > 0;
        if (waiting) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(waiting, true);
      assert.equal(Number((await sql`SELECT count(*) AS n FROM weather_runs`)[0].n), 0);
      assert.equal(Number((await sql`SELECT count(*) AS n FROM raw_artifacts`)[0].n), 0);
    } finally { await lock`SELECT pg_advisory_unlock(10101)`; lock.release(); }
    const first = await writing;
    await sql.unsafe("DROP TRIGGER p1_pause ON weather_values; DROP FUNCTION p1_pause()");
    const repeats = await Promise.all([store.save(asset.id, run, issue, 24), new PostgresWeatherIngestion(sql).save(asset.id, run, issue, 48)]);
    assert.ok(repeats.every(result => result.runId === first.runId && !result.inserted));
    assert.equal(Number((await sql`SELECT count(*) AS n FROM weather_values`)[0].n), 480);
    const [stored] = await sql`SELECT w.*, a.metadata FROM weather_runs w JOIN raw_artifacts a ON a.id=w.raw_artifact_id`;
    assert.equal(stored.published_at, null);
    assert.equal(stored.available_at, null);
    assert.equal(stored.metadata.raw_base64, run.raw_base64);
    const ports = new PostgresAgentPorts(sql, "p1-test");
    const request: JobPayload = { assetIds: [asset.id], issuedAt: issue, horizonHours: 48, mode: "replay",
      modelVersionId: "00000000-0000-0000-0000-000000000001", configVersion: "p1-test", dataPolicy: "history_only", eventKey: "p1" };
    const context = { jobId: "test", leaseToken: "test", signal: new AbortController().signal };
    await assert.rejects(ports.fetchWeatherRun(request, context), /NO_ELIGIBLE_WEATHER_RUN/);
    // Explicit TEST-ONLY publication evidence; never a production backfill of unknown publication.
    await sql`UPDATE weather_runs SET published_at=${issue}, available_at=${issue} WHERE id=${first.runId}`;
    const selected = await ports.fetchWeatherRun(request, context);
    assert.equal(selected.id, first.runId);
    assert.equal(selected.values?.length, 48);
    assert.equal(selected.values?.[0].value, JSON.parse(raw.toString()).hourly.wind_speed_100m[13]);
    await sql`UPDATE weather_runs SET available_at='2026-02-01T13:00:00Z' WHERE id=${first.runId}`;
    await assert.rejects(ports.fetchWeatherRun(request, context), /NO_ELIGIBLE_WEATHER_RUN/);
    await sql`UPDATE weather_runs SET available_at=${issue}, published_at='2026-02-01T13:00:00Z' WHERE id=${first.runId}`;
    await assert.rejects(ports.fetchWeatherRun(request, context), /NO_ELIGIBLE_WEATHER_RUN/);
    const research = { ...run, availability: { kind: "assumed" as const, delayHours: 12, rationale: "TEST ONLY", approvalReference: "TEST" } };
    const concurrent = await Promise.all([store.save(asset.id, research, issue, 48), store.save(asset.id, research, issue, 48)]);
    assert.equal(concurrent.filter(result => result.inserted).length, 1);
    assert.equal(concurrent[0].runId, concurrent[1].runId);
    const savedResearch = concurrent[0];
    const [researchRow] = await sql`SELECT * FROM weather_runs WHERE id=${savedResearch.runId}`;
    assert.equal(researchRow.published_at, null);
    assert.equal(researchRow.available_at, null);
    assert.equal(researchRow.availability_assumption.kind, "research_only");
    await assert.rejects(ports.fetchWeatherRun(request, context), /NO_ELIGIBLE_WEATHER_RUN/);
    const [wrongAsset] = await sql`INSERT INTO assets (kind, name, latitude, longitude)
      VALUES ('turbine', 'SYNTHETIC WRONG LOCATION', 42, 76.95) RETURNING id`;
    await assert.rejects(store.save(wrongAsset.id, run, issue, 48), /coordinates/);
    const directory = await mkdtemp(join(tmpdir(), "p1-weather-cli-"));
    try {
      const filename = join(directory, "config.json");
      await writeFile(filename, JSON.stringify({ assetIds: [asset.id], start: issue, end: "2026-02-02T12:00:00.000Z",
        stepHours: 24, horizonHours: 48, mode: "official", availability: { kind: "observed" } }));
      const cli = new URL("../../scripts/weather-ingest.ts", import.meta.url).href;
      const fixtureUrl = new URL("./evidence/feb-start.raw.json", import.meta.url).href;
      // Mock network only; execute the real CLI and PostgreSQL writer. Every run has synthetic test provenance.
      const source = `import {readFileSync} from 'node:fs';
        const raw = JSON.parse(readFileSync(new URL(${JSON.stringify(fixtureUrl)}), 'utf8'));
        globalThis.fetch = async url => {
          const cycle = new URL(url).searchParams.get('run');
          const response = structuredClone(raw);
          response.hourly.time = raw.hourly.time.map((_, i) => new Date(Date.parse(cycle + ':00Z') + i * 3600000).toISOString().slice(0,16));
          return new Response(JSON.stringify(response));
        };
        process.argv = ['node', 'weather-ingest.ts', ${JSON.stringify(filename)}];
        await import(${JSON.stringify(cli)});`;
      const invoke = () => new Promise<string>((resolve, reject) => {
        execFile(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source],
          { env: { ...process.env, DATABASE_URL: url! }, timeout: 30000 }, (error, stdout, stderr) => {
            if (error && error.code !== 2) reject(new Error(stderr || error.message));
            else resolve(stdout);
          });
      });
      const report = (await invoke()).trim().split("\n").map(line => JSON.parse(line));
      assert.equal(report.length, 2);
      assert.ok(report.every(row => row.coverage === 1 && row.status === "BLOCKED" && !row.officialEligible), JSON.stringify(report));
      const repeated = (await invoke()).trim().split("\n").map(line => JSON.parse(line));
      assert.deepEqual(repeated.map(row => row.runId), report.map(row => row.runId));
      assert.ok(repeated.every(row => !row.inserted));
    } finally { await rm(directory, { recursive: true }); }
  } finally { await sql.end(); }
});
