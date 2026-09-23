import { randomUUID } from "node:crypto";
import { payloadFingerprint, type ClaimedJob, type DecisionEvent, type JobPayload, type JobRecord, type JobStore } from "./types";

const clone = <T>(value: T): T => structuredClone(value);
const millis = (value: string) => Date.parse(value);

/** Deterministic fixture store. Production must implement the same fenced operations in PostgreSQL. */
export class MemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly keys = new Map<string, string>();
  private readonly journal = new Map<string, DecisionEvent[]>();

  async enqueue(key: string, payload: JobPayload, now: string, maxAttempts: number): Promise<JobRecord> {
    const existingId = this.keys.get(key);
    if (existingId) {
      const existing = this.jobs.get(existingId)!;
      if (payloadFingerprint(existing.payload) !== payloadFingerprint(payload)) {
        throw new Error("IDEMPOTENCY_CONFLICT");
      }
      return clone(existing);
    }
    if (!key || !Number.isFinite(millis(now)) || !Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error("INVALID_JOB");
    }
    const job: JobRecord = {
      id: randomUUID(), key, payload: clone(payload), status: "queued", step: 0,
      attempt: 0, maxAttempts, nextRunAt: now, leaseToken: null, leaseUntil: null,
      heartbeatAt: null, checkpoint: {}, resultId: null, errorCode: null,
      createdAt: now, updatedAt: now,
    };
    this.keys.set(key, job.id);
    this.jobs.set(job.id, job);
    return clone(job);
  }

  async get(id: string): Promise<JobRecord | null> {
    const job = this.jobs.get(id);
    return job ? clone(job) : null;
  }

  async claim(now: string, leaseMs: number): Promise<ClaimedJob | null> {
    if (!Number.isFinite(millis(now)) || leaseMs <= 0) throw new Error("INVALID_LEASE");
    // Synchronous mutation before the promise resolves makes concurrent callers mutually exclusive.
    const active = [...this.jobs.values()].some((job) => job.status === "running" &&
      job.leaseUntil !== null && millis(job.leaseUntil) > millis(now));
    if (active) return null;
    for (const expired of this.jobs.values()) {
      if (expired.status === "running" && expired.leaseUntil !== null &&
          millis(expired.leaseUntil) <= millis(now) && expired.attempt >= expired.maxAttempts) {
        expired.status = "failed";
        expired.errorCode = "LEASE_EXHAUSTED";
        expired.leaseToken = null;
        expired.leaseUntil = null;
        expired.updatedAt = now;
      }
    }
    const job = [...this.jobs.values()].find((candidate) =>
      (candidate.status === "queued" && millis(candidate.nextRunAt) <= millis(now)) ||
      (candidate.status === "running" && candidate.leaseUntil !== null && millis(candidate.leaseUntil) <= millis(now)));
    if (!job) return null;
    job.status = "running";
    job.attempt += 1;
    job.leaseToken = randomUUID();
    job.leaseUntil = new Date(millis(now) + leaseMs).toISOString();
    job.heartbeatAt = now;
    job.updatedAt = now;
    return clone(job) as ClaimedJob;
  }

  async heartbeat(id: string, token: string, now: string, leaseMs: number): Promise<boolean> {
    const job = this.owned(id, token, now);
    if (!job || leaseMs <= 0) return false;
    job.heartbeatAt = now;
    job.leaseUntil = new Date(millis(now) + leaseMs).toISOString();
    job.updatedAt = now;
    return true;
  }

  async advance(id: string, token: string, now: string, checkpoint: Record<string, unknown>, nextStep: number,
    resultId?: string, event?: Omit<DecisionEvent, "id" | "sequence">): Promise<boolean> {
    const job = this.owned(id, token, now);
    if (!job) return false;
    if (event) await this.appendEvent(event);
    job.checkpoint = clone(checkpoint);
    job.step = nextStep;
    job.status = resultId ? "completed" : "queued";
    job.resultId = resultId ?? null;
    job.attempt = 0;
    job.nextRunAt = now;
    job.leaseToken = null;
    job.leaseUntil = null;
    job.updatedAt = now;
    return true;
  }

  async fail(id: string, token: string, now: string, code: string, retryable: boolean, retryDelayMs: number,
    event?: Omit<DecisionEvent, "id" | "sequence">): Promise<boolean> {
    const job = this.owned(id, token, now);
    if (!job) return false;
    const retry = retryable && job.attempt < job.maxAttempts;
    if (event) await this.appendEvent(event);
    job.status = retry ? "queued" : "failed";
    job.errorCode = code;
    job.nextRunAt = retry ? new Date(millis(now) + retryDelayMs).toISOString() : now;
    job.leaseToken = null;
    job.leaseUntil = null;
    job.updatedAt = now;
    return true;
  }

  async cancel(id: string, now: string): Promise<JobRecord | null> {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") return clone(job);
    if (job.checkpoint.publicationCommitted) return clone(job);
    job.status = "cancelled";
    job.leaseToken = null;
    job.leaseUntil = null;
    job.updatedAt = now;
    await this.appendEvent({ jobId: id, step: "cancel", kind: "cancelled", reason: "CANCELLED",
      details: {}, createdAt: now });
    return clone(job);
  }

  async appendEvent(event: Omit<DecisionEvent, "id" | "sequence">): Promise<DecisionEvent> {
    const events = this.journal.get(event.jobId) ?? [];
    const saved = { ...clone(event), id: randomUUID(), sequence: events.length + 1 };
    events.push(saved);
    this.journal.set(event.jobId, events);
    return clone(saved);
  }

  async events(jobId: string): Promise<DecisionEvent[]> {
    return clone(this.journal.get(jobId) ?? []);
  }

  private owned(id: string, token: string, now: string): JobRecord | null {
    const job = this.jobs.get(id);
    return job?.status === "running" && job.leaseToken === token &&
      job.leaseUntil !== null && millis(job.leaseUntil) > millis(now) ? job : null;
  }
}
