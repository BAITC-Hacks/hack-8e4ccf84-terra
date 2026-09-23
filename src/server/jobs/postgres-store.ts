import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { payloadFingerprint, type ClaimedJob, type DecisionEvent, type JobPayload, type JobRecord, type JobStore } from "./types";

type Sql = ReturnType<typeof postgres>;
type Row = Record<string, unknown>;
const iso = (value: unknown): string => new Date(value as string).toISOString();
const hash = (payload: JobPayload) => createHash("sha256").update(payloadFingerprint(payload)).digest("hex");
const json = (value: unknown): postgres.JSONValue => JSON.parse(JSON.stringify(value)) as postgres.JSONValue;

function decode(row: Row): JobRecord {
  const state = row.checkpoint as Record<string, unknown>;
  return {
    id: row.id as string, key: row.idempotency_key as string,
    payload: state.payload as JobPayload, status: row.status as JobRecord["status"],
    step: Number(state.step ?? 0), attempt: Number(row.attempt),
    maxAttempts: Number(state.maxAttempts ?? 3), nextRunAt: state.nextRunAt as string,
    leaseToken: (state.leaseToken as string | null) ?? null,
    leaseUntil: row.lease_until ? iso(row.lease_until) : null,
    heartbeatAt: row.heartbeat_at ? iso(row.heartbeat_at) : null,
    checkpoint: (state.data as Record<string, unknown>) ?? {},
    resultId: (state.resultId as string | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

/** Uses S01's jobs/agent_events schema. Claim, lease fencing and journal sequence are database transactions. */
export class PostgresJobStore implements JobStore {
  constructor(private readonly sql: Sql) {}

  async enqueue(key: string, payload: JobPayload, now: string, maxAttempts: number): Promise<JobRecord> {
    if (!key || !Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error("INVALID_JOB");
    const requestHash = hash(payload);
    const state = { payload, step: 0, maxAttempts, nextRunAt: now, leaseToken: null, data: {}, resultId: null };
    return this.sql.begin(async (tx) => {
      const inserted = await tx`
        INSERT INTO jobs (kind, status, attempt, checkpoint, idempotency_key, request_hash, created_at, updated_at)
        VALUES ('agent', 'queued', 0, ${tx.json(json(state))}, ${key}, ${requestHash}, ${now}, ${now})
        ON CONFLICT (kind, idempotency_key) DO NOTHING RETURNING *`;
      if (inserted.length) return decode(inserted[0]);
      const existing = await tx`SELECT * FROM jobs WHERE kind = 'agent' AND idempotency_key = ${key}`;
      if (!existing.length || existing[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
      return decode(existing[0]);
    });
  }

  async get(id: string): Promise<JobRecord | null> {
    const rows = await this.sql`SELECT * FROM jobs WHERE id = ${id} AND kind = 'agent'`;
    return rows.length ? decode(rows[0]) : null;
  }

  async claim(now: string, leaseMs: number): Promise<ClaimedJob | null> {
    if (leaseMs <= 0 || !Number.isFinite(Date.parse(now))) throw new Error("INVALID_LEASE");
    return this.sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended('s07-agent-claim', 0))`;
      await tx`UPDATE jobs SET status = 'failed', error_code = 'LEASE_EXHAUSTED', lease_until = NULL,
        checkpoint = checkpoint || '{"leaseToken": null}'::jsonb, updated_at = ${now}
        WHERE kind = 'agent' AND status = 'running' AND lease_until <= ${now}
          AND attempt >= COALESCE((checkpoint->>'maxAttempts')::integer, 3)`;
      const active = await tx`SELECT id FROM jobs WHERE kind = 'agent' AND status = 'running'
        AND lease_until > ${now} LIMIT 1`;
      if (active.length) return null;
      const rows = await tx`SELECT * FROM jobs WHERE kind = 'agent'
        AND ((status = 'queued' AND (checkpoint->>'nextRunAt')::timestamptz <= ${now})
          OR (status = 'running' AND lease_until <= ${now}))
        ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows.length) return null;
      const state = rows[0].checkpoint as Record<string, unknown>;
      const token = randomUUID();
      const until = new Date(Date.parse(now) + leaseMs).toISOString();
      const updated = await tx`UPDATE jobs SET status = 'running', attempt = attempt + 1,
        lease_until = ${until}, heartbeat_at = ${now}, updated_at = ${now},
        checkpoint = ${tx.json(json({ ...state, leaseToken: token }))}
        WHERE id = ${rows[0].id as string} RETURNING *`;
      return decode(updated[0]) as ClaimedJob;
    });
  }

  async heartbeat(id: string, token: string, now: string, leaseMs: number): Promise<boolean> {
    if (leaseMs <= 0) return false;
    const until = new Date(Date.parse(now) + leaseMs).toISOString();
    const rows = await this.sql`UPDATE jobs SET heartbeat_at = ${now}, lease_until = ${until}, updated_at = ${now}
      WHERE id = ${id} AND kind = 'agent' AND status = 'running' AND lease_until > ${now}
        AND checkpoint->>'leaseToken' = ${token} RETURNING id`;
    return rows.length === 1;
  }

  async advance(id: string, token: string, now: string, checkpoint: Record<string, unknown>, nextStep: number,
    resultId?: string, event?: Omit<DecisionEvent, "id" | "sequence">): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const owned = await tx`SELECT * FROM jobs WHERE id = ${id} AND kind = 'agent' AND status = 'running'
        AND lease_until > ${now} AND checkpoint->>'leaseToken' = ${token} FOR UPDATE`;
      if (!owned.length) return false;
      const state = owned[0].checkpoint as Record<string, unknown>;
      await tx`UPDATE jobs SET status = ${resultId ? "completed" : "queued"}, attempt = 0,
        checkpoint = ${tx.json(json({ ...state, data: checkpoint, step: nextStep,
          resultId: resultId ?? null, leaseToken: null, nextRunAt: now }))},
        lease_until = NULL, updated_at = ${now}, error_code = NULL WHERE id = ${id}`;
      if (event) await this.insertEvent(tx, event);
      return true;
    });
  }

  async fail(id: string, token: string, now: string, code: string, retryable: boolean, retryDelayMs: number,
    event?: Omit<DecisionEvent, "id" | "sequence">): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const owned = await tx`SELECT * FROM jobs WHERE id = ${id} AND kind = 'agent' AND status = 'running'
        AND lease_until > ${now} AND checkpoint->>'leaseToken' = ${token} FOR UPDATE`;
      if (!owned.length) return false;
      const job = decode(owned[0]);
      const state = owned[0].checkpoint as Record<string, unknown>;
      const retry = retryable && job.attempt < job.maxAttempts;
      await tx`UPDATE jobs SET status = ${retry ? "queued" : "failed"}, error_code = ${code},
        checkpoint = ${tx.json(json({ ...state, leaseToken: null,
          nextRunAt: retry ? new Date(Date.parse(now) + retryDelayMs).toISOString() : now }))},
        lease_until = NULL, updated_at = ${now} WHERE id = ${id}`;
      if (event) await this.insertEvent(tx, event);
      return true;
    });
  }

  async cancel(id: string, now: string): Promise<JobRecord | null> {
    return this.sql.begin(async (tx) => {
      const rows = await tx`SELECT * FROM jobs WHERE id = ${id} AND kind = 'agent' FOR UPDATE`;
      if (!rows.length) return null;
      const current = decode(rows[0]);
      if (["completed", "failed", "cancelled"].includes(current.status)) return current;
      if (current.checkpoint.publicationCommitted) return current;
      const updated = await tx`UPDATE jobs SET status = 'cancelled', lease_until = NULL,
        checkpoint = checkpoint || '{"leaseToken": null}'::jsonb, updated_at = ${now}
        WHERE id = ${id} RETURNING *`;
      await this.insertEvent(tx, { jobId: id, step: "cancel", kind: "cancelled", reason: "CANCELLED",
        details: {}, createdAt: now });
      return decode(updated[0]);
    });
  }

  async appendEvent(event: Omit<DecisionEvent, "id" | "sequence">): Promise<DecisionEvent> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT id FROM jobs WHERE id = ${event.jobId} FOR UPDATE`;
      return this.insertEvent(tx, event);
    });
  }

  async events(jobId: string): Promise<DecisionEvent[]> {
    const rows = await this.sql`SELECT * FROM agent_events WHERE job_id = ${jobId} ORDER BY sequence`;
    return rows.map((row) => this.decodeEvent(row));
  }

  private decodeEvent(row: Row): DecisionEvent {
    return { id: row.id as string, jobId: row.job_id as string, sequence: Number(row.sequence),
      step: row.step as string, kind: row.kind as DecisionEvent["kind"],
      reason: row.reason as string, details: row.details as Record<string, unknown>, createdAt: iso(row.created_at) };
  }

  private async insertEvent(query: postgres.TransactionSql,
    event: Omit<DecisionEvent, "id" | "sequence">): Promise<DecisionEvent> {
    const rows = await query`INSERT INTO agent_events (job_id, sequence, step, kind, reason, details, created_at)
      VALUES (${event.jobId}, (SELECT COALESCE(MAX(sequence), 0) + 1 FROM agent_events WHERE job_id = ${event.jobId}),
        ${event.step}, ${event.kind}, ${event.reason}, ${query.json(json(event.details))}, ${event.createdAt}) RETURNING *`;
    return this.decodeEvent(rows[0]);
  }
}
