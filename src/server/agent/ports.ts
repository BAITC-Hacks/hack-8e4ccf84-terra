import type { JobPayload } from "../jobs/types";
import type { WeatherRun } from "../contracts";
import type { AgentDecision } from "./schemas";

export interface AgentExecutionContext {
  jobId: string;
  leaseToken: string;
  signal: AbortSignal;
}

export interface WeatherValueInput {
  runId?: string;
  assetId: string;
  targetTime: string;
  metric: string;
  value: number;
  unit: string | null;
  qualityFlag?: string;
}

export interface WeatherInput {
  id: string;
  availableAt: string | null;
  publishedAt: string | null;
  targets: string[];
  assetIds?: string[];
  runIds?: string[];
  source?: string;
  checksum?: string;
  coverage?: number;
  values?: WeatherValueInput[];
  runs?: WeatherRun[];
}

export interface ObservationInput {
  id: string;
  revision: number;
  eventTime: string;
  availableAt: string | null;
  value: number;
  assetId?: string;
  metric?: string;
  unit?: string | null;
  qualityFlag?: string;
  dataUse?: "features" | "evaluation_only";
}

export interface ForecastPoint {
  assetId: string;
  targetTime: string;
  value: number;
  unit: string | null;
}

export interface PublishedForecast {
  id: string;
  version: number;
  points: ForecastPoint[];
  weatherRunId: string;
  mode: JobPayload["mode"];
}

export interface AgentPorts {
  fetchWeatherRun(request: JobPayload, context: AgentExecutionContext): Promise<WeatherInput>;
  listObservations(request: JobPayload, context: AgentExecutionContext): Promise<ObservationInput[]>;
  decide?(input: { request: JobPayload; weather: WeatherInput; observations: ObservationInput[];
    allowedActions: AgentDecision["action"][] }, context: AgentExecutionContext): Promise<AgentDecision>;
  buildFeatures(input: { request: JobPayload; weather: WeatherInput; observations: ObservationInput[] }, context: AgentExecutionContext): Promise<Record<string, unknown>>;
  predict(input: { request: JobPayload; features: Record<string, unknown> }, context: AgentExecutionContext): Promise<ForecastPoint[]>;
  compareForecasts(input: { request: JobPayload; points: ForecastPoint[] }, context: AgentExecutionContext): Promise<Record<string, unknown>>;
  evaluateWhenActualsArrive(input: { request: JobPayload; points: ForecastPoint[] }, context: AgentExecutionContext): Promise<Record<string, unknown> | null>;
  explain?(input: { request: JobPayload; comparison: Record<string, unknown>; points: ForecastPoint[] }, context: AgentExecutionContext): Promise<string>;
  /** Must atomically return the existing forecast for the same publicationKey. */
  publish(input: {
    request: JobPayload;
    publicationKey: string;
    snapshotHash?: string;
    weatherRun: WeatherInput;
    observations: ObservationInput[];
    points: ForecastPoint[];
    comparison: Record<string, unknown>;
    evaluation: Record<string, unknown> | null;
    explanation: string;
  }, context: AgentExecutionContext): Promise<PublishedForecast>;
}
