import type {ForecastBatch} from "./types";

export const DEFAULT_REPRODUCIBILITY_TOLERANCE = 1e-6;

export function assertReproducible(
  first: ForecastBatch[],
  second: ForecastBatch[],
  tolerance = DEFAULT_REPRODUCIBILITY_TOLERANCE,
): void {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("Tolerance must be non-negative.");
  const left = valuesByKey(first);
  const right = valuesByKey(second);
  if (left.size !== right.size) throw new Error("Backtest runs contain a different number of forecast points.");
  for (const [key, expected] of left) {
    const actual = right.get(key);
    if (!actual) throw new Error(`Backtest rerun is missing ${key}.`);
    if (expected.snapshotHash !== actual.snapshotHash) throw new Error(`Snapshot changed for ${key}.`);
    if (Math.abs(expected.prediction - actual.prediction) > tolerance) {
      throw new Error(`Prediction changed beyond tolerance for ${key}.`);
    }
    if (expected.baselinePrediction === null || actual.baselinePrediction === null) {
      if (expected.baselinePrediction !== actual.baselinePrediction) throw new Error(`Baseline changed for ${key}.`);
    } else if (Math.abs(expected.baselinePrediction - actual.baselinePrediction) > tolerance) {
      throw new Error(`Baseline changed beyond tolerance for ${key}.`);
    }
  }
}

function valuesByKey(batches: ForecastBatch[]) {
  const result = new Map<string, {prediction: number; baselinePrediction: number | null; snapshotHash: string}>();
  for (const batch of batches) {
    for (const point of batch.points) {
      const key = `${point.assetId}|${point.issuedAt}|${point.targetTime}|${point.leadHour}`;
      if (result.has(key)) throw new Error(`Duplicate forecast point ${key}.`);
      result.set(key, {
        prediction: point.prediction,
        baselinePrediction: point.baselinePrediction ?? null,
        snapshotHash: point.snapshotHash,
      });
    }
  }
  return result;
}
