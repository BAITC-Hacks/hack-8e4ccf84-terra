import type {
  ForecastRequest, ModelVersion, Observation, ObservationReader,
  WeatherRun, WeatherRunReader, WeatherValue,
} from "../../src/server/contracts";
import {ForecastService} from "../../src/server/forecast/service";
import {MemoryForecastStore} from "../../src/server/forecast/memory-store";

export const issuedAt = "2026-01-31T12:00:00.000Z";
export const target = (lead: number) =>
  new Date(Date.parse(issuedAt) + lead * 3_600_000).toISOString();
export const request = (horizonHours: 24 | 48 = 24): ForecastRequest => ({
  assetIds: ["turbine-1"], issuedAt, horizonHours, mode: "backtest",
  modelVersionId: "baseline-v1", dataPolicy: "history_only",
});

const model: ModelVersion = {id: "baseline-v1", name: "persistence", version: "1",
  status: "approved", artifactId: null, codeVersion: "fixture-v1", featureSpec: {},
  trainingCutoff: null, parameters: {}, metrics: null};

export function fixture() {
  const data: {observations: Observation[]; runs: WeatherRun[]; weatherValues: WeatherValue[]} = {
    observations: [{id: "old", assetId: "turbine-1", metric: "normalized_power", value: 0.39,
      unit: "normalized", eventTime: "2026-01-31T11:00:00.000Z", availableAt: issuedAt,
      ingestedAt: issuedAt, revision: 1, qualityFlag: "accepted", sourceTimeZone: null,
      availabilityAssumption: null, rawArtifactId: null}],
    runs: [{id: "weather-1", assetId: "turbine-1", provider: "fixture", model: null,
      runTime: "2026-01-31T09:00:00.000Z", publishedAt: "2026-01-31T10:00:00.000Z",
      availableAt: "2026-01-31T10:00:00.000Z", fetchedAt: issuedAt, rawArtifactId: "raw-1",
      availabilityAssumption: null}],
    weatherValues: Array.from({length: 48}, (_, i) => ({runId: "weather-1",
      targetTime: target(i + 1), metric: "wind_speed", value: 6, unit: "m/s", heightMetres: 10})),
  };
  const observationReader: ObservationReader = {async listAvailable() { return data.observations; }};
  const weatherReader: WeatherRunReader = {
    async listRuns() { return data.runs; },
    async readValues(runId) { return data.weatherValues.filter((v) => v.runId === runId); },
  };
  const store = new MemoryForecastStore();
  return {data, store, service: new ForecastService(observationReader, weatherReader,
    store, "config-v1", model)};
}
