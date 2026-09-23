import type { AgentPorts } from "../agent/ports";
import { executeStep, STEPS, StepError } from "../agent/workflow";
import type { JobRecord, JobStore } from "./types";

export interface Clock { now(): string }
export const systemClock: Clock = { now: () => new Date().toISOString() };

export interface RunnerOptions {
  leaseMs?: number;
  retryBaseMs?: number;
}

/** One tick claims and executes one bounded step; no work continues after the returned promise. */
export class JobRunner {
  private readonly leaseMs: number;
  private readonly retryBaseMs: number;

  constructor(private readonly store: JobStore, private readonly ports: AgentPorts,
    private readonly clock: Clock = systemClock, options: RunnerOptions = {}) {
    this.leaseMs = options.leaseMs ?? 30_000;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
  }

  async tick(): Promise<JobRecord | null> {
    const job = await this.store.claim(this.clock.now(), this.leaseMs);
    if (!job) return null;
    const step = STEPS[job.step];
    await this.store.appendEvent({ jobId: job.id, step: step ?? "unknown", kind: "selected",
      reason: "Шаг выбран из сохранённого checkpoint", details: { attempt: job.attempt }, createdAt: this.clock.now() });
    const pulse = setInterval(() => {
      void this.store.heartbeat(job.id, job.leaseToken, this.clock.now(), this.leaseMs);
    }, Math.max(100, Math.floor(this.leaseMs / 3)));
    pulse.unref?.();
    try {
      const outcome = await executeStep(this.ports, job.payload, job.step, job.checkpoint);
      const advanced = await this.store.advance(job.id, job.leaseToken, this.clock.now(), outcome.checkpoint,
        job.step + 1, outcome.resultId);
      if (!advanced) return this.store.get(job.id);
      await this.store.appendEvent({ jobId: job.id, step, kind: outcome.fallback ? "fallback" : "completed",
        reason: outcome.reason, details: outcome.resultId ? { resultId: outcome.resultId } : {}, createdAt: this.clock.now() });
    } catch (error) {
      const code = error instanceof StepError ? error.code : "TOOL_FAILURE";
      const retryable = error instanceof StepError ? error.retryable : true;
      const delay = this.retryBaseMs * 2 ** Math.max(0, job.attempt - 1);
      const failed = await this.store.fail(job.id, job.leaseToken, this.clock.now(), code, retryable, delay);
      if (failed) {
        await this.store.appendEvent({ jobId: job.id, step, kind: retryable && job.attempt < job.maxAttempts ? "retry" : "failed",
          reason: code, details: { attempt: job.attempt, delayMs: retryable ? delay : 0 }, createdAt: this.clock.now() });
      }
    } finally {
      clearInterval(pulse);
    }
    return this.store.get(job.id);
  }
}
