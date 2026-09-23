import type postgres from "postgres";
import { setTimeout as delay } from "node:timers/promises";
import type { ForecastInputSnapshot } from "../data/snapshot/build";
import { PostgresJobStore } from "../jobs/postgres-store";
import type { JobPayload, JobStore } from "../jobs/types";
import { scheduledIssues, triggerConfigSchema } from "./config";
import { discoverIssue } from "./discovery";

type Sql = ReturnType<typeof postgres>;
const json = (value: unknown): postgres.JSONValue => JSON.parse(JSON.stringify(value)) as postgres.JSONValue;

export class InputTriggerWorker {
  readonly config;
  private readonly jobs: Pick<JobStore, "enqueue">;
  constructor(private readonly sql: Sql, config: unknown, jobs?: Pick<JobStore, "enqueue">) {
    this.config = triggerConfigSchema.parse(config);
    this.jobs = jobs ?? new PostgresJobStore(sql);
  }

  /** Full reconciliation is intentional: an ingested_at/UUID high-water mark loses late commits.
   * Bound the configured range operationally; endAt freezes a historical reconciliation window.
   */
  async discover(now: string, signal: AbortSignal = new AbortController().signal): Promise<void> {
    for (const issuedAt of scheduledIssues(this.config, now)) {
      signal.throwIfAborted();
      await this.sql.begin("isolation level repeatable read", async (tx) => {
        await discoverIssue(tx, this.config, issuedAt, now, signal, async (payload, snapshot) => {
          await tx`INSERT INTO input_trigger_events (event_key, payload, snapshot, discovered_at)
            VALUES (${payload.eventKey}, ${tx.json(json(payload))}, ${tx.json(json(snapshot))}, ${now})
            ON CONFLICT (event_key) DO NOTHING`;
        });
        signal.throwIfAborted();
      });
    }
  }

  async dispatch(now: string, signal: AbortSignal = new AbortController().signal): Promise<number> {
    signal.throwIfAborted();
    const pending = await this.sql`SELECT event_key, payload FROM input_trigger_events
      WHERE job_id IS NULL AND payload->>'mode' = ${this.config.mode}
        AND (payload->>'issuedAt')::timestamptz <= ${now}
        AND payload->>'modelVersionId' = ${this.config.modelVersionId}
        AND payload->>'configVersion' = ${this.config.configVersion}
        AND payload->'assetIds' <@ ${this.sql.json(this.config.assetIds)}::jsonb
      ORDER BY discovered_at, event_key LIMIT ${this.config.dispatchBatch}`;
    for (const row of pending) {
      signal.throwIfAborted();
      const job = await this.jobs.enqueue(row.event_key, row.payload as JobPayload, now, this.config.maxAttempts);
      // Crash or cancellation here leaves the ledger pending; retry returns the same job,
      // including cancelled/failed jobs. Cancellation never resurrects the original event.
      signal.throwIfAborted();
      await this.sql`UPDATE input_trigger_events SET job_id = ${job.id}, dispatched_at = ${now}
        WHERE event_key = ${row.event_key} AND job_id IS NULL`;
    }
    return pending.length;
  }

  async tick(now: string, signal: AbortSignal = new AbortController().signal): Promise<void> {
    // Recover already committed discoveries even when a subsequent scan fails.
    await this.dispatch(now, signal);
    await this.discover(now, signal);
    await this.dispatch(now, signal);
  }

  async run(signal: AbortSignal, onError: (error: unknown) => void = () => {}): Promise<void> {
    while (!signal.aborted) {
      try { await this.tick(new Date().toISOString(), signal); }
      catch (error) { if (!signal.aborted) onError(error); }
      try { await delay(this.config.pollMs, undefined, { signal }); }
      catch (error) { if (!signal.aborted) throw error; }
    }
  }
}

/** P6 integration seam: immutable discovery-time inputs without extending JobPayload.
 * Runtime must use this snapshot for input-trigger jobs to pin observation revisions too.
 */
export async function readTriggerSnapshot(sql: postgres.ISql, eventKey: string): Promise<ForecastInputSnapshot | null> {
  const rows = await sql`SELECT snapshot FROM input_trigger_events WHERE event_key = ${eventKey}`;
  return rows.length ? rows[0].snapshot as ForecastInputSnapshot : null;
}
