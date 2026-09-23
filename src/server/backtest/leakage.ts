import type {ForecastBatch, ForecastRequest, SnapshotReference} from "./types";

const MAX_TRAINING_CUTOFF = Date.parse("2026-01-31T23:59:59.999Z");

export class LeakageError extends Error {
  readonly code = "temporal_leakage";
}

export function assertLeakFreeSnapshot(snapshot: SnapshotReference, issuedAt: string): void {
  const issue = requiredTime(issuedAt, "issuedAt");
  for (const availableAt of snapshot.availableAt) {
    if (requiredTime(availableAt, "snapshot.availableAt") > issue) {
      throw new LeakageError(`Snapshot ${snapshot.hash} contains data available after ${issuedAt}.`);
    }
  }
}

export function assertLeakFreeRequest(request: ForecastRequest): void {
  const cutoff = requiredTime(request.trainingCutoff, "trainingCutoff");
  const issue = requiredTime(request.issuedAt, "issuedAt");
  if (cutoff > issue || cutoff > MAX_TRAINING_CUTOFF) {
    throw new LeakageError("Training cutoff must not exceed the issue time or 2026-01-31.");
  }
  if (request.dataPolicy !== "history_only" || request.mode !== "backtest") {
    throw new LeakageError("Backtests must use history_only data in backtest mode.");
  }
}

export function assertForecastMatchesRequest(batch: ForecastBatch, request: ForecastRequest): void {
  if (batch.snapshot.hash !== request.snapshotHash || batch.issuedAt !== request.issuedAt) {
    throw new LeakageError("Forecast service returned a different snapshot or issue time.");
  }
  assertLeakFreeSnapshot(batch.snapshot, request.issuedAt);
  if (batch.points.length !== request.assetIds.length * request.horizonHours) {
    throw new LeakageError("Forecast service returned an incomplete horizon.");
  }
  const seen = new Set<string>();
  for (const point of batch.points) {
    const validLead = Number.isInteger(point.leadHour)
      && point.leadHour >= 1
      && point.leadHour <= request.horizonHours;
    const expectedTarget = validLead
      ? new Date(Date.parse(request.issuedAt) + point.leadHour * 3_600_000).toISOString()
      : null;
    if (point.snapshotHash !== request.snapshotHash || point.issuedAt !== request.issuedAt) {
      throw new LeakageError("Forecast point provenance does not match the requested historical release.");
    }
    if (!request.assetIds.includes(point.assetId)
      || point.leadHour < 1
      || point.leadHour > request.horizonHours
      || !validLead
      || point.targetTime !== expectedTarget) {
      throw new LeakageError("Forecast point is outside the requested assets or horizon.");
    }
    if (!Number.isFinite(point.prediction)
      || (point.baselinePrediction !== null
        && point.baselinePrediction !== undefined
        && !Number.isFinite(point.baselinePrediction))) {
      throw new LeakageError("Forecast values must be finite.");
    }
    if (point.forecastRunId !== batch.forecastRunId || point.modelVersion !== request.modelVersion) {
      throw new LeakageError("Forecast point provenance does not match its run or model.");
    }
    const uniqueKey = `${point.assetId}|${point.leadHour}`;
    if (seen.has(uniqueKey)) throw new LeakageError(`Duplicate forecast point ${uniqueKey}.`);
    seen.add(uniqueKey);
  }
}

function requiredTime(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new LeakageError(`${field} must be a valid timestamp.`);
  return timestamp;
}
