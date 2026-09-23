import type {ForecastRequest} from "../../contracts";
import {targetHours, type ForecastInputSnapshot} from "../../data/snapshot/build";
import type {TrainingExample} from "../features";

/** Persisted selectors prevent silently mixing hub heights, units or providers. */
export interface ForecastFeatureSpec {
  source: "archived_forecast";
  provider: string;
  weatherModel: string;
  wind: {metric: string; unit: "m/s"; heightMetres: number | null};
  temperature: {metric: string; unit: "°C"; heightMetres: number | null};
}

export function utcMillis(value: string, label: string): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    throw new Error(`${label} must be canonical UTC ISO`);
  }
  return time;
}

/** The same function is used for training and production. It never reads targets. */
export function prepareForecastExamples(
  request: ForecastRequest, snapshot: ForecastInputSnapshot, spec: ForecastFeatureSpec,
): TrainingExample[] {
  if (![24, 48].includes(request.horizonHours) || request.dataPolicy !== "history_only") {
    throw new Error("Only 24/48-hour history_only inputs are supported");
  }
  const targets = targetHours(request.issuedAt, request.horizonHours);
  const issued = utcMillis(request.issuedAt, "issuedAt");
  const assets = [...request.assetIds].sort();
  if (!assets.length || new Set(assets).size !== assets.length || snapshot.issuedAt !== request.issuedAt ||
      JSON.stringify([...snapshot.assetIds].sort()) !== JSON.stringify(assets) || snapshot.missing.length) {
    throw new Error("Incomplete or mismatched input snapshot");
  }
  if (snapshot.observations.some((row) => !row.availableAt ||
      utcMillis(row.availableAt, "observation availableAt") > issued ||
      utcMillis(row.eventTime, "observation eventTime") > issued)) {
    throw new Error("Snapshot contains unavailable observations");
  }
  return assets.flatMap((assetId) => {
    const runs = snapshot.weatherRuns.filter((row) => row.assetId === assetId);
    if (runs.length !== 1) throw new Error(`Expected one weather run for ${assetId}`);
    const run = runs[0];
    if (!snapshot.weatherRunIds.includes(run.id) || !run.rawArtifactId ||
        run.provider !== spec.provider || run.model !== spec.weatherModel ||
        !run.availableAt || utcMillis(run.availableAt, "availableAt") > issued ||
        !run.publishedAt || utcMillis(run.publishedAt, "publishedAt") > issued ||
        !run.runTime || utcMillis(run.runTime, "runTime") > issued) {
      throw new Error("Weather provenance or as-of availability is invalid");
    }
    const feature = (targetTime: string, selector: ForecastFeatureSpec["wind"] | ForecastFeatureSpec["temperature"]) => {
      const rows = snapshot.weatherValues.filter((row) => row.runId === run.id &&
        row.targetTime === targetTime && row.metric === selector.metric && row.unit === selector.unit &&
        row.heightMetres === selector.heightMetres);
      if (rows.length !== 1 || !Number.isFinite(rows[0].value)) {
        throw new Error(`Missing, duplicate or invalid ${selector.metric} at ${targetTime}`);
      }
      return rows[0].value;
    };
    return targets.map((timestamp, index) => {
      const windSpeed = feature(timestamp, spec.wind);
      if (windSpeed < 0) throw new Error("Negative wind speed");
      return {assetId, timestamp, leadHours: index + 1, windSpeed,
        temperature: feature(timestamp, spec.temperature), target: 0};
    });
  });
}
