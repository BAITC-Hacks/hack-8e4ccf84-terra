import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { InputTriggerWorker, readTriggerSnapshot } from "../../src/server/triggers";
import { PostgresJobStore } from "../../src/server/jobs/postgres-store";
import { PostgresAgentPorts } from "../../src/server/agent/adapters";
import { JobRunner } from "../../src/server/jobs/runner";
import type { JobPayload } from "../../src/server/jobs/types";
import type { AgentExecutionContext } from "../../src/server/agent/ports";

const url = process.env.TEST_DATABASE_URL;
test("P3 PostgreSQL discovery, concurrent enqueue, crash recovery and canonical publication", { skip: !url }, async (t) => {
  const parsed = new URL(url!);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.match(parsed.pathname, /test/);
  const schema = `p3_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(url!, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const sql = postgres(url!, { max: 5, connection: { search_path: `${schema},public`, statement_timeout: 5000 } });
  const issuedAt = "2026-01-31T00:00:00.000Z";
  const later = "2026-01-31T01:00:00.000Z";
  try {
    const directory = new URL("../../src/server/db/migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
      await sql.unsafe(await readFile(new URL(name, directory), "utf8"));
    }
    const [asset] = await sql`INSERT INTO assets (kind, name) VALUES ('turbine', 'SYNTHETIC P3') RETURNING id`;
    const [raw] = await sql`INSERT INTO raw_artifacts (sha256, path, source)
      VALUES (${"a".repeat(64)}, '/synthetic/p3', 'synthetic-test') RETURNING id`;
    const [model] = await sql`INSERT INTO model_versions (name, version, status, code_version)
      VALUES ('persistence', 'p3-test', 'approved', 'test') RETURNING id`;
    const config = { assetIds: [asset.id], modelVersionId: model.id, configVersion: "p3-test",
      mode: "live", timezone: "UTC", issueHours: [0], startAt: issuedAt, endAt: issuedAt,
      horizons: [24], pollMs: 100 };
    const worker = new InputTriggerWorker(sql, config);
    const store = new PostgresJobStore(sql);
    const count = async (table: string) => Number((await sql.unsafe(`SELECT count(*) AS n FROM ${table}`))[0].n);
    const observation = async (revision: number, availableAt = issuedAt) => {
      await sql`INSERT INTO observations (asset_id, metric, value, unit, event_time, available_at, revision, quality_flag)
        VALUES (${asset.id}, 'normalized_power', ${revision / 10}, 'normalized', ${issuedAt}, ${availableAt}, ${revision}, 'accepted')`;
    };
    const weather = async (availableAt = issuedAt, publishedAt: string | null = issuedAt) => {
      const [row] = await sql`INSERT INTO weather_runs (asset_id, provider, published_at, available_at, raw_artifact_id)
        VALUES (${asset.id}, 'synthetic-test', ${publishedAt}, ${availableAt}, ${raw.id}) RETURNING id`;
      return row.id as string;
    };
    const fill = async (run: string, from: number, to: number) => {
      await sql`INSERT INTO weather_values (run_id, target_time, metric, value, unit)
        SELECT ${run}, ${issuedAt}::timestamptz + n * interval '1 hour', 'wind_speed', 8, 'm/s'
        FROM generate_series(${from}::integer, ${to}::integer) n`;
    };
    await observation(1);
    const run = await weather();
    await fill(run, 1, 23);
    await t.test("incomplete/future/unproven weather and future measurements are excluded", async () => {
      await fill(await weather(later), 1, 24);
      await fill(await weather(issuedAt, null), 1, 24);
      await observation(9, later);
      await worker.tick(later);
      assert.equal(await count("jobs"), 0);
      await fill(run, 24, 24);
      await worker.discover(later);
      assert.equal(await count("input_trigger_events"), 1);
    });
    await t.test("crash before enqueue and after committed enqueue; concurrent restart deduplicates", async () => {
      const before = new InputTriggerWorker(sql, config, { enqueue: async () => { throw new Error("CRASH_BEFORE"); } });
      await assert.rejects(before.dispatch(later), /CRASH_BEFORE/);
      assert.equal(await count("jobs"), 0);
      const after = new InputTriggerWorker(sql, config, { enqueue: async (...args) => {
        await store.enqueue(...args); throw new Error("CRASH_AFTER");
      } });
      await assert.rejects(after.dispatch(later), /CRASH_AFTER/);
      assert.equal(await count("jobs"), 1);
      assert.equal(Number((await sql`SELECT count(*) AS n FROM input_trigger_events WHERE job_id IS NULL`)[0].n), 1);
      await Promise.all([worker.dispatch(later), new InputTriggerWorker(sql, config).dispatch(later)]);
      await worker.tick(later);
      assert.equal(await count("jobs"), 1);
      assert.equal(Number((await sql`SELECT count(*) AS n FROM input_trigger_events WHERE job_id IS NULL`)[0].n), 0);
    });
    await t.test("cancelled job is not recreated; new admissible revision creates a new event", async () => {
      const [row] = await sql`SELECT job_id FROM input_trigger_events`;
      await store.cancel(row.job_id, later);
      await observation(2);
      // A serialization conflict is safe: the loser retries the entire scan without advancing a cursor.
      const results = await Promise.allSettled([worker.tick(later), new InputTriggerWorker(sql, config).tick(later)]);
      for (const result of results) if (result.status === "rejected") assert.equal(result.reason.code, "40001");
      await worker.tick(later);
      assert.equal(await count("jobs"), 2);
      assert.equal((await store.get(row.job_id))!.status, "cancelled");
      const rows = await sql`SELECT event_key FROM input_trigger_events ORDER BY event_key`;
      const revisions = await Promise.all(rows.map(async (row) => (await readTriggerSnapshot(sql, row.event_key))!.observations[0].revision));
      assert.deepEqual(revisions.sort(), [1, 2]);
    });
    await t.test("new weather, horizon, model/config and replay are independent identities", async () => {
      await fill(await weather(), 1, 48);
      await worker.tick(later);
      assert.equal(await count("jobs"), 3);
      await new InputTriggerWorker(sql, { ...config, mode: "replay" }).tick(later);
      assert.equal(await count("jobs"), 5);
      await new InputTriggerWorker(sql, { ...config, horizons: [48], configVersion: "v2" }).tick(later);
      assert.equal(await count("jobs"), 6);
      await worker.tick(later);
      assert.equal(await count("jobs"), 6);
    });
    await t.test("abort after enqueue recovers and does not revive cancelled work", async () => {
      await observation(3);
      await worker.discover(later);
      const controller = new AbortController();
      const cancelling = new InputTriggerWorker(sql, config, { enqueue: async (...args) => {
        const job = await store.enqueue(...args); controller.abort(); return job;
      } });
      await assert.rejects(cancelling.dispatch(later, controller.signal), { name: "AbortError" });
      await worker.tick(later);
      assert.equal(await count("jobs"), 8);
      const stopped = AbortSignal.abort();
      await assert.rejects(worker.tick(later, stopped), { name: "AbortError" });
      assert.equal(await count("jobs"), 8);
    });
    await t.test("temporary PostgreSQL outage retries without losing a committed discovery", async () => {
      await observation(4);
      await worker.discover(later);
      const [row] = await sql`SELECT event_key FROM input_trigger_events WHERE job_id IS NULL LIMIT 1`;
      let failures = 0;
      const controller = new AbortController();
      // Terminate a real PostgreSQL connection once; the pool and run() must recover.
      const flaky = new InputTriggerWorker(sql, config, { enqueue: async (...args) => {
        if (!failures) { failures++; await sql`SELECT pg_terminate_backend(pg_backend_pid())`; }
        const job = await store.enqueue(...args);
        return job;
      } });
      const running = flaky.run(controller.signal, () => {});
      try {
        for (let n = 0; n < 100; n++) {
          if ((await sql`SELECT job_id FROM input_trigger_events WHERE event_key = ${row.event_key}`)[0].job_id) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.ok((await sql`SELECT job_id FROM input_trigger_events WHERE event_key = ${row.event_key}`)[0].job_id);
      } finally { controller.abort(); await running; }
      assert.equal(failures, 1);
    });
    await t.test("contract adapter pins revisions; existing runner publishes once per effective input", async () => {
      // P6 owns production wiring. This test adapter is deliberately NOT a production fallback.
      class PinnedPorts extends PostgresAgentPorts {
        override async listObservations(request: JobPayload, context: AgentExecutionContext) {
          context.signal.throwIfAborted();
          const snapshot = await readTriggerSnapshot(sql, request.eventKey);
          assert.ok(snapshot);
          return snapshot.observations.map((item) => ({ ...item, dataUse: "features" as const }));
        }
      }
      const runner = new JobRunner(store, new PinnedPorts(sql, "p3-test"), undefined, { retryBaseMs: 1 });
      for (let step = 0; step < 300; step++) {
        if (await runner.tick()) continue;
        const [active] = await sql`SELECT count(*) AS n FROM jobs WHERE status IN ('queued', 'running')`;
        if (!Number(active.n)) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const [counts] = await sql`SELECT count(*) FILTER (WHERE status = 'completed') AS completed,
        count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        count(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')) AS pending FROM jobs`;
      assert.equal(Number(counts.pending), 0, JSON.stringify(await sql`SELECT status, error_code, checkpoint->>'step' AS step FROM jobs`));
      assert.equal(Number(counts.cancelled), 1);
      assert.equal(await count("forecast_runs"), Number(counts.completed));
      const prior = await count("forecast_runs");
      await worker.tick(later);
      assert.equal(await runner.tick(), null);
      assert.equal(await count("forecast_runs"), prior);
      assert.equal(Number((await sql`SELECT count(*) AS n FROM forecast_values WHERE unit <> 'normalized'`)[0].n), 0);
    });
    await t.test("uncommitted input is invisible; later commit is discovered without a lossy cursor", async () => {
      let release!: () => void;
      let ready!: () => void;
      const barrier = new Promise<void>((resolve) => { release = resolve; });
      const inserted = new Promise<void>((resolve) => { ready = resolve; });
      const before = await count("input_trigger_events");
      const transaction = sql.begin(async (tx) => {
        const [row] = await tx`INSERT INTO weather_runs (asset_id, provider, published_at, available_at, raw_artifact_id)
          VALUES (${asset.id}, 'synthetic-test', ${issuedAt}, ${issuedAt}, ${raw.id}) RETURNING id`;
        await tx`INSERT INTO weather_values (run_id, target_time, metric, value, unit)
          SELECT ${row.id}, ${issuedAt}::timestamptz + n * interval '1 hour', 'wind_speed', 9, 'm/s'
          FROM generate_series(1, 24) n`;
        ready();
        await barrier;
      });
      await inserted;
      try {
        await worker.discover(later);
        assert.equal(await count("input_trigger_events"), before);
      } finally { release(); await transaction; }
      await worker.discover(later);
      assert.equal(await count("input_trigger_events"), before + 1);
    });
    await t.test("standalone CLI enqueues pending discoveries and is restart-idempotent", async () => {
      const directory = await mkdtemp(join(tmpdir(), "p3-cli-"));
      const path = join(directory, "config.json");
      const databaseUrl = new URL(url!);
      databaseUrl.searchParams.set("search_path", `${schema},public`);
      await writeFile(path, JSON.stringify(config));
      try {
        const run = () => spawnSync(process.execPath,
          ["node_modules/tsx/dist/cli.mjs", "scripts/input-trigger-worker.ts", path, "--once"],
          { encoding: "utf8", timeout: 20_000, env: { ...process.env, DATABASE_URL: databaseUrl.toString() } });
        const first = run();
        assert.equal(first.status, 0, first.stderr);
        const before = await count("jobs");
        const second = run();
        assert.equal(second.status, 0, second.stderr);
        assert.equal(await count("jobs"), before);
        assert.equal(Number((await sql`SELECT count(*) AS n FROM input_trigger_events WHERE job_id IS NULL`)[0].n), 0);
      } finally { await unlink(path); await rmdir(directory); }
    });
  } finally {
    await sql.end();
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
