import type {ForecastRequest, ForecastValue} from "../../contracts";
import {targetHours, type ForecastInputSnapshot} from "../../data/snapshot/build";

/** Persistence is legal only when an actual power observation was available by issue time. */
export function predictPersistence(
  request: ForecastRequest, snapshot: ForecastInputSnapshot,
): ForecastValue[] {
  const targets = targetHours(request.issuedAt, request.horizonHours);
  return request.assetIds.flatMap((assetId) => {
    const latest = snapshot.observations.find((row) => row.assetId === assetId);
    const run = snapshot.weatherRuns.find((row) => row.assetId === assetId);
    if (!latest || !run) return [];
    return targets.map((targetTime) => ({
      assetId, targetTime, value: latest.value, unit: latest.unit,
      qualityFlag: "baseline_persistence",
    }));
  });
}
