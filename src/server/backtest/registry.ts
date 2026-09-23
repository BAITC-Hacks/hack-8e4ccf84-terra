import {randomUUID} from "node:crypto";
import {fingerprint} from "../../lib/json";
import type {EvaluationReport} from "../evaluation/types";
import type {BacktestJob, BacktestRequest, BacktestResult, ForecastPoint} from "./types";

export class BacktestConflictError extends Error {
  readonly code = "idempotency_conflict";
}

export class BacktestNotFoundError extends Error {
  readonly code = "not_found";
}

export class BacktestRegistry {
  private readonly jobs = new Map<string, BacktestJob>();
  private readonly idempotency = new Map<string, string>();
  private readonly evaluations = new Map<string, EvaluationReport>();
  private readonly forecasts = new Map<string, ForecastPoint[]>();

  enqueue(request: BacktestRequest, idempotencyKey: string | null): {job: BacktestJob; reused: boolean} {
    const requestHash = fingerprint("backtest-request", request);
    if (idempotencyKey) {
      const existingId = this.idempotency.get(idempotencyKey);
      if (existingId) {
        const existing = this.jobs.get(existingId) as BacktestJob;
        if (existing.requestHash !== requestHash) {
          throw new BacktestConflictError("Idempotency-Key was already used with a different request.");
        }
        return {job: existing, reused: true};
      }
    }
    const now = new Date().toISOString();
    const job: BacktestJob = {
      id: randomUUID(),
      status: "queued",
      request,
      requestHash,
      idempotencyKey,
      evaluationId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    if (idempotencyKey) this.idempotency.set(idempotencyKey, job.id);
    return {job, reused: false};
  }

  getJob(id: string): BacktestJob {
    const job = this.jobs.get(id);
    if (!job) throw new BacktestNotFoundError(`Backtest job ${id} was not found.`);
    return job;
  }

  markRunning(id: string): BacktestJob {
    return this.updateJob(id, {status: "running", error: null});
  }

  complete(result: BacktestResult): BacktestJob {
    for (const batch of result.forecastRuns) this.forecasts.set(batch.forecastRunId, batch.points);
    this.evaluations.set(result.evaluation.id, result.evaluation);
    return this.updateJob(result.jobId, {
      status: "succeeded",
      evaluationId: result.evaluation.id,
      error: null,
    });
  }

  fail(id: string, error: {code: string; message: string}): BacktestJob {
    return this.updateJob(id, {status: "failed", error});
  }

  getEvaluation(id: string): EvaluationReport {
    const evaluation = this.evaluations.get(id);
    if (!evaluation) throw new BacktestNotFoundError(`Evaluation ${id} was not found.`);
    return evaluation;
  }

  getForecast(id: string): ForecastPoint[] {
    const forecast = this.forecasts.get(id);
    if (!forecast) throw new BacktestNotFoundError(`Forecast ${id} was not found.`);
    return forecast;
  }

  registerEvaluation(report: EvaluationReport): void {
    this.evaluations.set(report.id, report);
  }

  registerForecast(id: string, points: ForecastPoint[]): void {
    this.forecasts.set(id, points);
  }

  clear(): void {
    this.jobs.clear();
    this.idempotency.clear();
    this.evaluations.clear();
    this.forecasts.clear();
  }

  private updateJob(id: string, patch: Partial<BacktestJob>): BacktestJob {
    const job = this.getJob(id);
    const updated = {...job, ...patch, updatedAt: new Date().toISOString()};
    this.jobs.set(id, updated);
    return updated;
  }
}

const globalRegistry = globalThis as typeof globalThis & {__windBacktestRegistry?: BacktestRegistry};
export const backtestRegistry = globalRegistry.__windBacktestRegistry ??= new BacktestRegistry();
