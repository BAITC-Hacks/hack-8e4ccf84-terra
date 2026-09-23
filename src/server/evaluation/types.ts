export type LeadBucket = "lead_1_24" | "lead_25_48";

export type EvaluationPoint = {
  assetId: string;
  issuedAt: string;
  targetTime: string;
  leadHour: number;
  prediction: number;
  baselinePrediction?: number | null;
  actual?: number | null;
  unit: string;
  forecastRunId: string;
};

export type ErrorMetrics = {
  mae: number;
  rmse: number;
  n: number;
};

export type MetricSlice = {
  dimension: "overall" | "asset" | "lead" | "asset_lead";
  assetId: string | null;
  leadBucket: LeadBucket | null;
  model: ErrorMetrics | null;
  comparison: {
    model: ErrorMetrics;
    baseline: ErrorMetrics;
  } | null;
};

export type ExclusionReason =
  | "outside_evaluation_period"
  | "missing_actual"
  | "invalid_actual"
  | "invalid_prediction"
  | "unsupported_lead";

export type EvaluationExclusion = {
  forecastRunId: string;
  assetId: string;
  targetTime: string;
  reason: ExclusionReason;
};

export type EvaluationReport = {
  id: string;
  backtestJobId: string;
  snapshotHash: string;
  evaluationStart: string;
  evaluationEndExclusive: string;
  eligiblePairCount: number;
  evaluatedPairCount: number;
  coverage: number;
  metrics: MetricSlice[];
  exclusions: EvaluationExclusion[];
  createdAt: string;
};
