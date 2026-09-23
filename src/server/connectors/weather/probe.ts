import {z} from "zod";
import {AppError} from "../../../agent/errors";
import {ARCHIVE_START, FIELDS, HOUR, runUrl} from "./open-meteo";

export const weatherProbeSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  initializedAt: z.iso.datetime(),
});

// Connectivity probe only: never promotes weather into a historical forecast snapshot.
export async function probeWeather(input: unknown, http: typeof fetch = fetch, now = new Date()) {
  const config = weatherProbeSchema.parse(input);
  const cycle = Date.parse(config.initializedAt);
  if (cycle < ARCHIVE_START || cycle > now.getTime() || cycle % (6 * HOUR) !== 0)
    throw new AppError("validation_error", "Choose an archived UTC model cycle at 00, 06, 12 or 18 hours.");
  const url = runUrl({...config, availability: {kind: "observed"}}, config.initializedAt);
  let response: Response;
  try {
    response = await http(url, {signal: AbortSignal.timeout(15_000), cache: "no-store", redirect: "error"});
  } catch {
    throw new AppError("connector_unavailable", "Weather provider is unavailable.");
  }
  if (!response.ok) throw new AppError("connector_unavailable", "Weather run is unavailable from the provider.");
  const hourly = z.object({time: z.array(z.string()).min(1).max(240)}).catchall(z.array(z.number().finite().nullable()));
  const parsed = z.object({hourly, hourly_units: z.record(z.string(), z.string())}).safeParse(await response.json().catch(() => null));
  if (!parsed.success || FIELDS.some(field => !Array.isArray(parsed.data.hourly[field]) ||
      parsed.data.hourly[field].length !== parsed.data.hourly.time.length) ||
      parsed.data.hourly_units.temperature_2m !== "°C" ||
      parsed.data.hourly_units.wind_speed_10m !== "m/s" || parsed.data.hourly_units.wind_speed_100m !== "m/s")
    throw new AppError("invalid_connector_response", "Weather provider returned an invalid response.");
  return {status: "healthy" as const, provider: "Open-Meteo Single Runs", initializedAt: config.initializedAt,
    checkedAt: new Date().toISOString(), hours: parsed.data.hourly.time.length, fields: [...FIELDS],
    units: parsed.data.hourly_units, publishedAt: null};
}
