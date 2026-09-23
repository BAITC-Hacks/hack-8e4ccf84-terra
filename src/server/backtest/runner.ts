import {createHash, randomUUID} from "node:crypto";
import {evaluateForecasts} from "../evaluation/evaluate";
import type {EvaluationPoint} from "../evaluation/types";
import {assertForecastMatchesRequest, assertLeakFreeRequest, assertLeakFreeSnapshot} from "./leakage";
import type {
  ActualsReader,
  BacktestForecastService,
  BacktestRequest,
  BacktestResult,
  ForecastBatch,
  ForecastRequest,
} from "./types";

const DEFAULT_EVALUATION_START = "2026-02-01T00:00:00.000Z";
const DEFAULT_EVALUATION_END = "2026-03-01T00:00:00.000Z";
const FIRST_ALLOWED_ISSUE = Date.parse("2026-01-31T00:00:00.000Z");
const LAST_ALLOWED_ISSUE = Date.parse("2026-02-28T23:59:59.999Z");

export class BacktestRunner {
  constructor(
    private readonly forecasts: BacktestForecastService,
    private readonly actuals: ActualsReader,
  ) {}

  async run(request: BacktestRequest, jobId: string = randomUUID()): Promise<BacktestResult> {
    validateRequest(request);
    const batches: ForecastBatch[] = [];
    for (const issuedAt of [...request.issueTimes].sort((a, b) => Date.parse(a) - Date.parse(b))) {
      const partial: Omit<ForecastRequest, "snapshotHash"> = {
        assetIds: [...request.assetIds],
        issuedAt,
        horizonHours: request.horizonHours,
        modelVersion: request.modelVersion,
        mode: "backtest",
        dataPolicy: "history_only",
        trainingCutoff: request.trainingCutoff,
      };
      assertLeakFreeRequest({...partial, snapshotHash: "pending"});
      const snapshot = await this.forecasts.createSnapshot(partial);
      assertLeakFreeSnapshot(snapshot, issuedAt);
      const forecastRequest: ForecastRequest = {...partial, snapshotHash: snapshot.hash};
      assertLeakFreeRequest(forecastRequest);
      const batch = await this.forecasts.forecast(forecastRequest);
      assertForecastMatchesRequest(batch, forecastRequest);
      batches.push(batch);
    }

    const evaluationStart = request.evaluationStart ?? DEFAULT_EVALUATION_START;
    const evaluationEndExclusive = request.evaluationEndExclusive ?? DEFAULT_EVALUATION_END;
    // Actuals never enter the forecast service. They are joined only after every historical release is fixed.
    const actuals = await this.actuals.readActuals({
      assetIds: request.assetIds,
      start: evaluationStart,
      endExclusive: evaluationEndExclusive,
    });
    const actualByKey = new Map(actuals.map((actual) => [key(actual.assetId, actual.targetTime), actual.value]));
    const points: EvaluationPoint[] = batches.flatMap((batch) => batch.points.map((point) => ({
      ...point,
      actual: actualByKey.get(key(point.assetId, point.targetTime)) ?? null,
    })));
    const snapshotHashes = batches.map((batch) => batch.snapshot.hash);
    const combinedSnapshotHash = createHash("sha256").update(snapshotHashes.join("\n")).digest("hex");
    const evaluation = evaluateForecasts({
      id: randomUUID(),
      backtestJobId: jobId,
      snapshotHash: combinedSnapshotHash,
      points,
      evaluationStart,
      evaluationEndExclusive,
    });
    return {jobId, snapshotHashes, forecastRuns: batches, evaluation};
  }
}

function validateRequest(request: BacktestRequest): void {
  if (request.assetIds.length === 0 || new Set(request.assetIds).size !== request.assetIds.length) {
    throw new Error("At least one unique asset is required.");
  }
  if (request.issueTimes.length === 0) throw new Error("An explicit release schedule is required.");
  if ((request.evaluationStart && request.evaluationStart !== DEFAULT_EVALUATION_START)
    || (request.evaluationEndExclusive && request.evaluationEndExclusive !== DEFAULT_EVALUATION_END)) {
    throw new Error("The official backtest evaluation period is fixed to February 2026 UTC.");
  }
  let previous = -Infinity;
  for (const issue of request.issueTimes) {
    const timestamp = Date.parse(issue);
    if (!Number.isFinite(timestamp)
      || timestamp < FIRST_ALLOWED_ISSUE
      || timestamp > LAST_ALLOWED_ISSUE
      || timestamp <= previous) {
      throw new Error("Release times must be unique, increasing UTC timestamps from 2026-01-31 through February.");
    }
    previous = timestamp;
  }
}

function key(assetId: string, targetTime: string): string {
  return `${assetId}|${targetTime}`;
}
