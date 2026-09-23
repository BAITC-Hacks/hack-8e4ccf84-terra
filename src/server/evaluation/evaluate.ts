import type {
  ErrorMetrics,
  EvaluationExclusion,
  EvaluationPoint,
  EvaluationReport,
  LeadBucket,
  MetricSlice,
} from "./types";

type EvaluateInput = {
  id: string;
  backtestJobId: string;
  snapshotHash: string;
  points: EvaluationPoint[];
  evaluationStart?: string;
  evaluationEndExclusive?: string;
  createdAt?: string;
};

const FEBRUARY_START = "2026-02-01T00:00:00.000Z";
const MARCH_START = "2026-03-01T00:00:00.000Z";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function metrics(pairs: Array<{actual: number; prediction: number}>): ErrorMetrics {
  const absolute = pairs.reduce(
    (sum, pair) => sum + Math.abs(pair.actual - pair.prediction),
    0,
  );
  const squared = pairs.reduce((sum, pair) => {
    const error = pair.actual - pair.prediction;
    return sum + error * error;
  }, 0);
  return {
    mae: absolute / pairs.length,
    rmse: Math.sqrt(squared / pairs.length),
    n: pairs.length,
  };
}

export function leadBucket(leadHour: number): LeadBucket | null {
  if (leadHour >= 1 && leadHour <= 24) return "lead_1_24";
  if (leadHour >= 25 && leadHour <= 48) return "lead_25_48";
  return null;
}

function buildSlice(
  points: Array<EvaluationPoint & {actual: number}>,
  dimension: MetricSlice["dimension"],
  assetId: string | null,
  bucket: LeadBucket | null,
): MetricSlice {
  const modelPairs = points.map(({actual, prediction}) => ({actual, prediction}));
  const commonPairs = points.filter((point) => finite(point.baselinePrediction));

  return {
    dimension,
    assetId,
    leadBucket: bucket,
    model: modelPairs.length === 0 ? null : metrics(modelPairs),
    comparison: commonPairs.length === 0
      ? null
      : {
          model: metrics(commonPairs.map(({actual, prediction}) => ({actual, prediction}))),
          baseline: metrics(
            commonPairs.map(({actual, baselinePrediction}) => ({
              actual,
              prediction: baselinePrediction as number,
            })),
          ),
        },
  };
}

export function evaluateForecasts(input: EvaluateInput): EvaluationReport {
  const evaluationStart = input.evaluationStart ?? FEBRUARY_START;
  const evaluationEndExclusive = input.evaluationEndExclusive ?? MARCH_START;
  const start = Date.parse(evaluationStart);
  const end = Date.parse(evaluationEndExclusive);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error("The evaluation interval must be a valid non-empty UTC interval.");
  }

  const exclusions: EvaluationExclusion[] = [];
  const eligible: Array<EvaluationPoint & {actual: number}> = [];
  let eligiblePairCount = 0;

  for (const point of input.points) {
    const target = Date.parse(point.targetTime);
    if (!Number.isFinite(target) || target < start || target >= end) {
      exclusions.push(exclusion(point, "outside_evaluation_period"));
      continue;
    }
    eligiblePairCount += 1;
    if (leadBucket(point.leadHour) === null) {
      exclusions.push(exclusion(point, "unsupported_lead"));
    } else if (!finite(point.prediction)) {
      exclusions.push(exclusion(point, "invalid_prediction"));
    } else if (point.actual === null || point.actual === undefined) {
      exclusions.push(exclusion(point, "missing_actual"));
    } else if (!finite(point.actual)) {
      exclusions.push(exclusion(point, "invalid_actual"));
    } else {
      eligible.push({...point, actual: point.actual});
    }
  }

  const assets = [...new Set(eligible.map((point) => point.assetId))].sort();
  const buckets: LeadBucket[] = ["lead_1_24", "lead_25_48"];
  const slices: MetricSlice[] = [buildSlice(eligible, "overall", null, null)];
  for (const asset of assets) {
    slices.push(buildSlice(eligible.filter((point) => point.assetId === asset), "asset", asset, null));
  }
  for (const bucket of buckets) {
    slices.push(buildSlice(eligible.filter((point) => leadBucket(point.leadHour) === bucket), "lead", null, bucket));
  }
  for (const asset of assets) {
    for (const bucket of buckets) {
      slices.push(buildSlice(
        eligible.filter((point) => point.assetId === asset && leadBucket(point.leadHour) === bucket),
        "asset_lead",
        asset,
        bucket,
      ));
    }
  }

  return {
    id: input.id,
    backtestJobId: input.backtestJobId,
    snapshotHash: input.snapshotHash,
    evaluationStart: new Date(start).toISOString(),
    evaluationEndExclusive: new Date(end).toISOString(),
    eligiblePairCount,
    evaluatedPairCount: eligible.length,
    coverage: eligiblePairCount === 0 ? 0 : eligible.length / eligiblePairCount,
    metrics: slices,
    exclusions,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

function exclusion(point: EvaluationPoint, reason: EvaluationExclusion["reason"]): EvaluationExclusion {
  return {
    forecastRunId: point.forecastRunId,
    assetId: point.assetId,
    targetTime: point.targetTime,
    reason,
  };
}
