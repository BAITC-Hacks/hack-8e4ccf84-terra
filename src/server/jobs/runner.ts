import type { AgentPorts } from "../agent/ports";
import { executeStep, STEPS, StepError } from "../agent/workflow";
import type { JobRecord, JobStore } from "./types";

export interface Clock { now(): string }
export const systemClock: Clock = { now: () => new Date().toISOString() };

export interface RunnerOptions {
  leaseMs?: number;
  retryBaseMs?: number;
  heartbeatMs?: number;
  tickBudgetMs?: number;
}

/** One tick claims and executes one bounded step; no work continues after the returned promise. */
export class JobRunner {
  private readonly leaseMs: number;
  private readonly retryBaseMs: number;
  private readonly heartbeatMs: number;
  private readonly tickBudgetMs: number;

  constructor(private readonly store: JobStore, private readonly ports: AgentPorts,
    private readonly clock: Clock = systemClock, options: RunnerOptions = {}) {
    this.leaseMs = options.leaseMs ?? 30_000;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.heartbeatMs = options.heartbeatMs ?? Math.max(100, Math.floor(this.leaseMs / 3));
    this.tickBudgetMs = options.tickBudgetMs ?? 60_000;
    if (this.heartbeatMs >= this.leaseMs) throw new Error("INVALID_HEARTBEAT_INTERVAL");
  }

  async tick(): Promise<JobRecord | null> {
    const job = await this.store.claim(this.clock.now(), this.leaseMs);
    if (!job) return null;
    const step = STEPS[job.step];
    await this.store.appendEvent({ jobId: job.id, step: step ?? "unknown", kind: "selected",
      reason: "Шаг выбран из сохранённого checkpoint", details: { attempt: job.attempt }, createdAt: this.clock.now() });
    const controller = new AbortController();
    const budget = setTimeout(() => controller.abort(new StepError("TICK_BUDGET_EXCEEDED", true)),
      this.tickBudgetMs);
    budget.unref?.();
    let heartbeat = Promise.resolve();
    const pulse = setInterval(() => {
      heartbeat = heartbeat.then(async () => {
        try {
          if (!await this.store.heartbeat(job.id, job.leaseToken, this.clock.now(), this.leaseMs)) {
            controller.abort(new StepError("LEASE_LOST"));
          }
        } catch {
          controller.abort(new StepError("HEARTBEAT_FAILED", true));
        }
      });
    }, this.heartbeatMs);
    pulse.unref?.();
    try {
      const startedAt = this.clock.now();
      const outcome = await executeStep(this.ports, job.payload, job.step, job.checkpoint,
        { jobId: job.id, leaseToken: job.leaseToken, signal: controller.signal });
      await heartbeat;
      controller.signal.throwIfAborted();
      const finishedAt = this.clock.now();
      const advanced = await this.store.advance(job.id, job.leaseToken, this.clock.now(), outcome.checkpoint,
        job.step + 1, outcome.resultId, { jobId: job.id, step,
          kind: outcome.fallback ? "fallback" : "completed", reason: outcome.reason,
          details: { ...(outcome.resultId ? { resultId: outcome.resultId } : {}), startedAt, finishedAt,
            durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) }, createdAt: finishedAt });
      if (!advanced) return this.store.get(job.id);
    } catch (error) {
      const cause = controller.signal.aborted ? controller.signal.reason : error;
      const code = cause instanceof StepError ? cause.code : "TOOL_FAILURE";
      const retryable = cause instanceof StepError ? cause.retryable : true;
      const delay = this.retryBaseMs * 2 ** Math.max(0, job.attempt - 1);
      const event = { jobId: job.id, step, kind: retryable && job.attempt < job.maxAttempts ? "retry" as const : "failed" as const,
        reason: code, details: { attempt: job.attempt, delayMs: retryable ? delay : 0 }, createdAt: this.clock.now() };
      await this.store.fail(job.id, job.leaseToken, this.clock.now(), code, retryable, delay, event);
    } finally {
      clearInterval(pulse);
      clearTimeout(budget);
    }
    return this.store.get(job.id);
  }
}
