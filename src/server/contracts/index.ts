/** Shared server contracts for S02-S08. All instants are UTC ISO-8601 strings. */
export type Id = string;
export type UtcInstant = string;
export type IssuedAt = UtcInstant;
export type TargetTime = UtcInstant;
export type RunMode = "live" | "backtest" | "replay";
export type DataPolicy = "history_only" | "evaluation_only";
export type AvailabilityAssumption = {
  kind: string;
  parameters: Record<string, unknown>;
  rationale: string;
};
export type ArtifactRef = { id: Id; sha256: string; path: string };

export interface Asset {
  id: Id;
  kind: "station" | "turbine" | "line";
  name: string;
  stationId: Id | null;
  latitude: number | null;
  longitude: number | null;
  timeZone: string | null;
  powerUnit: string | null;
  powerScale: Record<string, unknown> | null;
}

export interface Observation {
  id: Id;
  assetId: Id;
  metric: string;
  value: number;
  unit: string | null;
  eventTime: UtcInstant;
  availableAt: UtcInstant | null;
  ingestedAt: UtcInstant;
  revision: number;
  qualityFlag: string;
  sourceTimeZone: string | null;
  availabilityAssumption: AvailabilityAssumption | null;
  rawArtifactId: Id | null;
}

export interface WeatherRun {
  id: Id;
  assetId: Id;
  provider: string;
  model: string | null;
  runTime: UtcInstant | null;
  publishedAt: UtcInstant | null;
  availableAt: UtcInstant | null;
  fetchedAt: UtcInstant;
  rawArtifactId: Id;
  availabilityAssumption: AvailabilityAssumption | null;
}

export interface WeatherValue {
  runId: Id;
  targetTime: TargetTime;
  metric: string;
  value: number;
  unit: string | null;
  heightMetres: number | null;
}

export interface InputSnapshot {
  id: Id;
  issuedAt: IssuedAt;
  assetIds: Id[];
  observationRevisions: Array<{ observationId: Id; revision: number }>;
  weatherRunIds: Id[];
  payload: Record<string, unknown>;
  configVersion: string;
  sha256: string;
  createdAt: UtcInstant;
}

export interface ModelVersion {
  id: Id;
  name: string;
  version: string;
  status: "candidate" | "approved" | "retired";
  artifactId: Id | null;
  codeVersion: string;
  featureSpec: Record<string, unknown>;
  trainingCutoff: UtcInstant | null;
  parameters: Record<string, unknown>;
  metrics: Record<string, unknown> | null;
}

export interface ForecastRequest {
  assetIds: Id[];
  issuedAt: IssuedAt;
  horizonHours: 24 | 48;
  mode: RunMode;
  modelVersionId: Id;
  dataPolicy: DataPolicy;
}

export interface ForecastValue {
  assetId: Id;
  targetTime: TargetTime;
  value: number;
  unit: string | null;
  qualityFlag: string | null;
}

export interface ForecastRun {
  id: Id;
  request: ForecastRequest;
  inputSnapshotId: Id;
  status: "pending" | "incomplete" | "published" | "failed";
  version: number;
  idempotencyKey: string | null;
  previousVersionId: Id | null;
  incompleteReasons: Record<string, unknown> | null;
  createdAt: UtcInstant;
  publishedAt: UtcInstant | null;
  values: ForecastValue[];
}

export interface Job {
  id: Id;
  kind: "import" | "training" | "forecast" | "backtest" | "agent";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  attempt: number;
  leaseUntil: UtcInstant | null;
  heartbeatAt: UtcInstant | null;
  checkpoint: Record<string, unknown>;
  errorCode: string | null;
  createdAt: UtcInstant;
  updatedAt: UtcInstant;
}

export interface AgentEvent {
  id: Id;
  jobId: Id;
  sequence: number;
  step: string;
  kind: string;
  reason: string | null;
  details: Record<string, unknown>;
  createdAt: UtcInstant;
}

export interface EvaluationRun {
  id: Id;
  forecastRunIds: Id[];
  windowStart: UtcInstant;
  windowEnd: UtcInstant;
  dataPolicy: DataPolicy;
  status: "pending" | "completed" | "failed";
  coverage: number | null;
  exclusions: Record<string, unknown>;
}

export interface ObservationReader {
  listAvailable(input: {
    assetIds: Id[];
    metrics: string[];
    from: UtcInstant;
    to: UtcInstant;
    asOf: IssuedAt;
    policy: DataPolicy;
  }): Promise<Observation[]>;
}

export interface WeatherRunReader {
  listRuns(input: { assetIds: Id[]; asOf: IssuedAt }): Promise<WeatherRun[]>;
  readValues(runId: Id, from: TargetTime, to: TargetTime): Promise<WeatherValue[]>;
}

export interface SnapshotBuilder {
  build(request: ForecastRequest): Promise<InputSnapshot>;
}

export interface Predictor {
  predict(input: {
    request: ForecastRequest;
    snapshot: InputSnapshot;
    model: ModelVersion;
  }): Promise<ForecastValue[]>;
}

export interface ForecastRepository {
  publish(input: {
    request: ForecastRequest;
    snapshot: InputSnapshot;
    values: ForecastValue[];
  }): Promise<ForecastRun>;
  get(id: Id): Promise<ForecastRun | null>;
}

export interface JobStep {
  execute(job: Job): Promise<{ status: Job["status"]; checkpoint: Job["checkpoint"] }>;
}

export interface EvaluationReader {
  listTruth(input: {
    assetIds: Id[];
    from: TargetTime;
    to: TargetTime;
    asOf: UtcInstant;
  }): Promise<Observation[]>;
  getRun(id: Id): Promise<EvaluationRun | null>;
}

export interface ApiError {
  code: string;
  message: string;
  request_id: string;
  details?: Record<string, unknown>;
}
