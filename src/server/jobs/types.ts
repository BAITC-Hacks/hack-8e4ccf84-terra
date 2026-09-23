export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface JobPayload {
  assetIds: string[];
  issuedAt: string;
  horizonHours: 24 | 48;
  mode: "live" | "backtest" | "replay";
  modelVersionId: string;
  configVersion: string;
  dataPolicy: "history_only";
  eventKey: string;
  weatherRunId?: string;
}

export function payloadFingerprint(payload: JobPayload): string {
  return JSON.stringify({
    assetIds: [...payload.assetIds].sort(), issuedAt: payload.issuedAt,
    horizonHours: payload.horizonHours, mode: payload.mode,
    modelVersionId: payload.modelVersionId, configVersion: payload.configVersion,
    dataPolicy: payload.dataPolicy, eventKey: payload.eventKey,
    weatherRunId: payload.weatherRunId ?? null,
  });
}

export interface JobRecord {
  id: string;
  key: string;
  payload: JobPayload;
  status: JobStatus;
  step: number;
  attempt: number;
  maxAttempts: number;
  nextRunAt: string;
  leaseToken: string | null;
  leaseUntil: string | null;
  heartbeatAt: string | null;
  checkpoint: Record<string, unknown>;
  resultId: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimedJob extends JobRecord {
  leaseToken: string;
  leaseUntil: string;
}

export interface DecisionEvent {
  id: string;
  jobId: string;
  sequence: number;
  step: string;
  kind: "selected" | "completed" | "retry" | "failed" | "fallback";
  reason: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface JobStore {
  enqueue(key: string, payload: JobPayload, now: string, maxAttempts: number): Promise<JobRecord>;
  get(id: string): Promise<JobRecord | null>;
  claim(now: string, leaseMs: number): Promise<ClaimedJob | null>;
  heartbeat(id: string, token: string, now: string, leaseMs: number): Promise<boolean>;
  advance(id: string, token: string, now: string, checkpoint: Record<string, unknown>, nextStep: number, resultId?: string): Promise<boolean>;
  fail(id: string, token: string, now: string, code: string, retryable: boolean, retryDelayMs: number): Promise<boolean>;
  appendEvent(event: Omit<DecisionEvent, "id" | "sequence">): Promise<DecisionEvent>;
  events(jobId: string): Promise<DecisionEvent[]>;
}
