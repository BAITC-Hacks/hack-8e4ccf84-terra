import type {EvaluationPoint, EvaluationReport} from "../evaluation/types";

export type SnapshotReference = {
  hash: string;
  availableAt: string[];
};

export type ForecastRequest = {
  assetIds: string[];
  issuedAt: string;
  horizonHours: 24 | 48;
  modelVersion: string;
  mode: "backtest";
  dataPolicy: "history_only";
  trainingCutoff: string;
  snapshotHash: string;
};

export type ForecastPoint = Omit<EvaluationPoint, "actual"> & {
  status: string;
  modelVersion: string;
  weatherRunId: string;
  snapshotHash: string;
};

export type ForecastBatch = {
  forecastRunId: string;
  issuedAt: string;
  snapshot: SnapshotReference;
  points: ForecastPoint[];
};

export interface BacktestForecastService {
  createSnapshot(input: Omit<ForecastRequest, "snapshotHash">): Promise<SnapshotReference>;
  forecast(input: ForecastRequest): Promise<ForecastBatch>;
}

export interface ActualsReader {
  readActuals(input: {
    assetIds: string[];
    start: string;
    endExclusive: string;
  }): Promise<Array<{assetId: string; targetTime: string; value: number | null}>>;
}

export type BacktestRequest = {
  assetIds: string[];
  issueTimes: string[];
  horizonHours: 24 | 48;
  modelVersion: string;
  trainingCutoff: string;
  evaluationStart?: string;
  evaluationEndExclusive?: string;
};

export type BacktestResult = {
  jobId: string;
  snapshotHashes: string[];
  forecastRuns: ForecastBatch[];
  evaluation: EvaluationReport;
};

export type BacktestJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  request: BacktestRequest;
  requestHash: string;
  idempotencyKey: string | null;
  evaluationId: string | null;
  error: {code: string; message: string} | null;
  createdAt: string;
  updatedAt: string;
};
