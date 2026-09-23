import {createHash} from "node:crypto";
import type {ForecastRequest, ObservationReader, WeatherRunReader, WeatherValue} from "../contracts";
import {buildForecastSnapshot, targetHours, type ForecastInputSnapshot} from "../data/snapshot/build";

/** Keep canonical as-of selection, retaining all selected-run features from the very same read. */
export async function buildModelSnapshot(request: ForecastRequest, observations: ObservationReader,
  weather: WeatherRunReader, configVersion: string): Promise<ForecastInputSnapshot> {
  const reads = new Map<string, WeatherValue[]>();
  const snapshot = await buildForecastSnapshot(request, observations, {
    listRuns: input => weather.listRuns(input),
    async readValues(id, from, to) {
      const values = structuredClone(await weather.readValues(id, from, to));
      reads.set(id, values);
      return values;
    },
  }, configVersion);
  const targets = new Set(targetHours(request.issuedAt, request.horizonHours));
  const weatherValues = snapshot.weatherRunIds.flatMap(id => (reads.get(id) ?? [])
    .filter(value => value.runId === id && targets.has(value.targetTime)))
    .sort((a, b) => a.runId.localeCompare(b.runId) || a.targetTime.localeCompare(b.targetTime) ||
      a.metric.localeCompare(b.metric) || (a.heightMetres ?? -1) - (b.heightMetres ?? -1));
  const payload = {...snapshot.payload, weatherValues};
  const sha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  weatherValues.forEach(Object.freeze);
  Object.freeze(weatherValues);
  Object.freeze(payload);
  return Object.freeze({...snapshot, id: sha256, weatherValues, payload, sha256});
}
