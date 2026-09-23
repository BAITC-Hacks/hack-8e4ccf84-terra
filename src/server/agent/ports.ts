import type { JobPayload } from "../jobs/types";

export interface WeatherInput {
  id: string;
  availableAt: string | null;
  publishedAt: string | null;
  targets: string[];
}

export interface ObservationInput {
  id: string;
  revision: number;
  eventTime: string;
  availableAt: string | null;
  value: number;
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
  fetchWeatherRun(request: JobPayload): Promise<WeatherInput>;
  listObservations(request: JobPayload): Promise<ObservationInput[]>;
  buildFeatures(input: { request: JobPayload; weather: WeatherInput; observations: ObservationInput[] }): Promise<Record<string, unknown>>;
  predict(input: { request: JobPayload; features: Record<string, unknown> }): Promise<ForecastPoint[]>;
  compareForecasts(input: { request: JobPayload; points: ForecastPoint[] }): Promise<Record<string, unknown>>;
  evaluateWhenActualsArrive(input: { request: JobPayload; points: ForecastPoint[] }): Promise<Record<string, unknown> | null>;
  explain?(input: { request: JobPayload; comparison: Record<string, unknown>; points: ForecastPoint[] }): Promise<string>;
  /** Must atomically return the existing forecast for the same publicationKey. */
  publish(input: {
    request: JobPayload;
    publicationKey: string;
    weatherRun: WeatherInput;
    observations: ObservationInput[];
    points: ForecastPoint[];
    comparison: Record<string, unknown>;
    evaluation: Record<string, unknown> | null;
    explanation: string;
  }): Promise<PublishedForecast>;
}
