import {isDeepStrictEqual} from "node:util";
import type {ForecastInputSnapshot} from "../data/snapshot/build";
import {targetHours} from "../data/snapshot/build";
import type {JobPayload} from "../jobs/types";
import type {WeatherInput} from "./ports";
import {StepError, validateInputs} from "./workflow";

export type TriggerSnapshotReader = (eventKey: string) => Promise<ForecastInputSnapshot | null>;

export async function pinnedSnapshot(request: JobPayload, read?: TriggerSnapshotReader): Promise<ForecastInputSnapshot | null> {
  if (!request.eventKey.startsWith("input-trigger:v1:")) return null;
  const snapshot = await read?.(request.eventKey);
  if (!snapshot) throw new StepError("TRIGGER_SNAPSHOT_UNAVAILABLE");
  // PostgreSQL JSONB reorders keys, so retain the producer's digest instead of hashing its serialization again.
  const expectedKey = `input-trigger:v1:${request.mode}:${request.assetIds[0]}:${request.issuedAt}:${request.horizonHours}:` +
    `${request.modelVersionId}:${encodeURIComponent(request.configVersion)}:${snapshot.sha256}`;
  if (!/^[a-f0-9]{64}$/.test(snapshot.sha256) || request.eventKey !== expectedKey || snapshot.missing.length ||
      snapshot.issuedAt !== request.issuedAt || snapshot.configVersion !== request.configVersion ||
      JSON.stringify([...snapshot.assetIds].sort()) !== JSON.stringify([...request.assetIds].sort()) ||
      snapshot.weatherRunIds.length !== 1 || snapshot.weatherRunIds[0] !== request.weatherRunId ||
      ["observations", "weatherRuns", "weatherValues", "missing"].some(key =>
        !isDeepStrictEqual(snapshot[key as keyof ForecastInputSnapshot], snapshot.payload[key]))) {
    throw new StepError("TRIGGER_SNAPSHOT_MISMATCH");
  }
  validateInputs(request, pinnedWeather(snapshot, request), snapshot.observations);
  if (request.assetIds.some(id => !snapshot.observations.some(row => row.assetId === id)))
    throw new StepError("MISSING_OBSERVATIONS");
  return snapshot;
}

export function pinnedWeather(snapshot: ForecastInputSnapshot, request: JobPayload): WeatherInput {
  const run = snapshot.weatherRuns[0];
  if (snapshot.weatherRuns.length !== 1 || run.id !== request.weatherRunId ||
      !request.assetIds.includes(run.assetId)) throw new StepError("TRIGGER_SNAPSHOT_MISMATCH");
  return {id: run.id, runIds: snapshot.weatherRunIds, assetIds: snapshot.assetIds,
    availableAt: run.availableAt, publishedAt: run.publishedAt, targets: targetHours(request.issuedAt, request.horizonHours),
    runs: snapshot.weatherRuns, source: run.provider, coverage: 1,
    values: snapshot.weatherValues.map(value => ({...value, assetId: run.assetId, qualityFlag: "accepted"})),
  };
}
