import { createHash } from "node:crypto";
import type postgres from "postgres";
import { payloadFingerprint, type JobPayload } from "../jobs/types";

type Sql = ReturnType<typeof postgres>;
export interface ReplayConfig { assetIds: string[]; horizonHours: 24 | 48; modelVersionId: string;
  configVersion: string; dataPolicy: "history_only" }
export interface DurableReplayEvent { id: string; availableAt: string; issuedAt: string; weatherRunId: string }
export interface ReplaySession { id: string; status: "active" | "completed"; virtualTime: string;
  cursor: number; config: ReplayConfig; createdAt: string; updatedAt: string }
const iso = (value: Date | string) => new Date(value).toISOString();
const digest = (payload: JobPayload) => createHash("sha256").update(payloadFingerprint(payload)).digest("hex");

export class PostgresReplayStore {
  constructor(private readonly sql: Sql) {}

  async create(config: ReplayConfig, virtualTime: string, events: DurableReplayEvent[]): Promise<ReplaySession> {
    if (!Number.isFinite(Date.parse(virtualTime)) || !events.length ||
      events.some((event) => !event.id || Date.parse(event.availableAt) > Date.parse(event.issuedAt))) {
      throw new Error("INVALID_REPLAY_SESSION");
    }
    return this.sql.begin(async (tx) => {
      const rows = await tx`INSERT INTO replay_sessions (virtual_time, config)
        VALUES (${virtualTime}, ${tx.json(config as unknown as postgres.JSONValue)}) RETURNING *`;
      for (const [index, event] of [...events].sort((a, b) => a.availableAt.localeCompare(b.availableAt) ||
        a.id.localeCompare(b.id)).entries()) {
        await tx`INSERT INTO replay_input_events (session_id, sequence, event_key, kind,
          available_at, issued_at, weather_run_id) VALUES (${rows[0].id}, ${index + 1}, ${event.id},
          'weather', ${event.availableAt}, ${event.issuedAt}, ${event.weatherRunId})`;
      }
      return this.decode(rows[0]);
    });
  }

  async get(id: string): Promise<ReplaySession | null> {
    const rows = await this.sql`SELECT * FROM replay_sessions WHERE id = ${id}`;
    return rows.length ? this.decode(rows[0]) : null;
  }

  async advance(id: string, to: string, now = new Date().toISOString()): Promise<{ session: ReplaySession; jobIds: string[] }> {
    if (!Number.isFinite(Date.parse(to))) throw new Error("INVALID_REPLAY_TIME");
    return this.sql.begin(async (tx) => {
      const sessions = await tx`SELECT * FROM replay_sessions WHERE id = ${id} FOR UPDATE`;
      if (!sessions.length) throw new Error("REPLAY_NOT_FOUND");
      const session = this.decode(sessions[0]);
      if (Date.parse(to) < Date.parse(session.virtualTime)) throw new Error("TIME_REVERSAL");
      const events = await tx`SELECT * FROM replay_input_events WHERE session_id = ${id}
        AND sequence > ${session.cursor} AND available_at <= ${to} ORDER BY sequence`;
      const jobIds: string[] = [];
      for (const event of events) {
        const eventKey = `replay:${id}:${event.event_key}`;
        const payload: JobPayload = { ...session.config, issuedAt: iso(event.issued_at), mode: "replay",
          eventKey, weatherRunId: event.weather_run_id };
        const state = { payload, step: 0, maxAttempts: 3, nextRunAt: now, leaseToken: null,
          data: {}, resultId: null };
        const inserted = await tx`INSERT INTO jobs (kind, status, attempt, checkpoint, idempotency_key,
          request_hash, created_at, updated_at) VALUES ('agent', 'queued', 0,
          ${tx.json(state as unknown as postgres.JSONValue)}, ${eventKey}, ${digest(payload)}, ${now}, ${now})
          ON CONFLICT (kind, idempotency_key) DO UPDATE SET updated_at = jobs.updated_at RETURNING id`;
        jobIds.push(inserted[0].id);
      }
      const cursor = events.length ? Number(events.at(-1)!.sequence) : session.cursor;
      const updated = await tx`UPDATE replay_sessions SET virtual_time = ${to}, cursor = ${cursor},
        updated_at = ${now} WHERE id = ${id} RETURNING *`;
      return { session: this.decode(updated[0]), jobIds };
    });
  }

  private decode(row: Record<string, unknown>): ReplaySession {
    return { id: row.id as string, status: row.status as ReplaySession["status"],
      virtualTime: iso(row.virtual_time as Date), cursor: Number(row.cursor), config: row.config as ReplayConfig,
      createdAt: iso(row.created_at as Date), updatedAt: iso(row.updated_at as Date) };
  }
}
