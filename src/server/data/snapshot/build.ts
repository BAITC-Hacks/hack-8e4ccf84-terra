import {createHash} from "node:crypto";
import type {
  ForecastRequest, InputSnapshot, Observation, ObservationReader,
  WeatherRun, WeatherRunReader, WeatherValue,
} from "../../contracts";

export interface ForecastInputSnapshot extends InputSnapshot {
  payload: Record<string, unknown>;
  observations: Observation[];
  weatherRuns: WeatherRun[];
  weatherValues: WeatherValue[];
  missing: string[];
}

const hourMs = 3_600_000;
const earliest = "1970-01-01T00:00:00.000Z";

export function targetHours(issuedAt: string, horizonHours: 24 | 48): string[] {
  const start = Date.parse(issuedAt);
  if (!Number.isFinite(start) || start % hourMs !== 0 || new Date(start).toISOString() !== issuedAt) {
    throw new Error("issued_at must be a canonical UTC whole hour");
  }
  return Array.from({length: horizonHours}, (_, index) =>
    new Date(start + (index + 1) * hourMs).toISOString());
}

function eligibleObservation(row: Observation, issuedAt: string): boolean {
  return row.eventTime <= issuedAt && row.availableAt !== null &&
    row.availableAt <= issuedAt && Number.isFinite(row.value) && row.qualityFlag === "accepted";
}

function eligibleRun(run: WeatherRun, issuedAt: string): boolean {
  return run.availableAt !== null && run.availableAt <= issuedAt &&
    (run.publishedAt === null || run.publishedAt <= issuedAt) &&
    (run.runTime === null || run.runTime <= issuedAt);
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/** Reads only as-of inputs, then copies every selected value into an immutable calculation snapshot. */
export async function buildForecastSnapshot(
  request: ForecastRequest,
  observations: ObservationReader,
  weather: WeatherRunReader,
  configVersion: string,
  createdAt = new Date().toISOString(),
): Promise<ForecastInputSnapshot> {
  const targets = targetHours(request.issuedAt, request.horizonHours);
  const assetIds = [...new Set(request.assetIds)].sort();
  if (assetIds.length === 0 || assetIds.length !== request.assetIds.length) {
    throw new Error("asset_ids must be nonempty and unique");
  }
  const read = await observations.listAvailable({
    assetIds, metrics: ["normalized_power"], from: earliest,
    to: request.mode === "backtest" && request.dataPolicy === "history_only"
      ? [request.issuedAt, "2026-01-31T23:59:59.999Z"].sort()[0] : request.issuedAt,
    asOf: request.issuedAt, policy: request.dataPolicy,
  });
  const selected = assetIds.flatMap((assetId) => {
    const candidates = read.filter((row) => row.assetId === assetId &&
      row.metric === "normalized_power" && eligibleObservation(row, request.issuedAt) &&
      !(request.mode === "backtest" && request.dataPolicy === "history_only" &&
        row.eventTime >= "2026-02-01T00:00:00.000Z"));
    candidates.sort((a, b) => b.eventTime.localeCompare(a.eventTime) ||
      b.revision - a.revision || b.id.localeCompare(a.id));
    return candidates.slice(0, 1);
  });

  const runs = (await weather.listRuns({assetIds, asOf: request.issuedAt}))
    .filter((run) => assetIds.includes(run.assetId) && eligibleRun(run, request.issuedAt));
  runs.sort((a, b) => b.availableAt!.localeCompare(a.availableAt!) || b.id.localeCompare(a.id));
  const selectedRuns: WeatherRun[] = [];
  const selectedValues: WeatherValue[] = [];
  const missing: string[] = [];
  for (const assetId of assetIds) {
    if (!selected.some((row) => row.assetId === assetId)) missing.push(`observation:${assetId}`);
    let found = false;
    for (const run of runs.filter((item) => item.assetId === assetId)) {
      const values = await weather.readValues(run.id, targets[0], targets.at(-1)!);
      const wind = values.filter((item) => item.runId === run.id &&
        item.metric === "wind_speed" && item.unit === "m/s" && Number.isFinite(item.value));
      const byTarget = new Map(wind.map((item) => [item.targetTime, item]));
      if (targets.every((target) => byTarget.has(target))) {
        selectedRuns.push(run);
        selectedValues.push(...targets.map((target) => byTarget.get(target)!));
        found = true;
        break;
      }
    }
    if (!found) missing.push(`weather:${assetId}`);
  }
  const frozenObservations = structuredClone(selected);
  const frozenRuns = structuredClone(selectedRuns);
  const frozenValues = structuredClone(selectedValues);
  const observationRevisions = frozenObservations.map((row) => ({observationId: row.id, revision: row.revision}));
  const weatherRunIds = frozenRuns.map((run) => run.id);
  const content = {issuedAt: request.issuedAt, assetIds, observationRevisions, weatherRunIds,
    observations: frozenObservations, weatherRuns: frozenRuns, weatherValues: frozenValues,
    configVersion, missing};
  const sha256 = stableHash(content);
  return freezeDeep({id: sha256, ...content, payload: content, sha256, createdAt});
}
