import { createHash } from "node:crypto";
import { z } from "zod";
import { ARCHIVE_START, availableAt, FIELDS, HOUR, OpenMeteoWeather, runUrl, utc, validateConfig } from "../../connectors/weather/open-meteo";
import { WeatherError } from "../../connectors/weather/types";
import type { AvailabilityPolicy, SavedWeatherRun, WeatherConfig, WeatherPoint, WeatherRepository } from "../../connectors/weather/types";

function samePolicy(a: AvailabilityPolicy, b: AvailabilityPolicy): boolean {
  if (a.kind === "observed" && b.kind === "observed") return true;
  return a.kind === "assumed" && b.kind === "assumed" && a.delayHours === b.delayHours &&
    a.rationale === b.rationale && a.approvalReference === b.approvalReference;
}

const responseSchema = z.object({
  utc_offset_seconds: z.literal(0),
  latitude: z.number().finite(), longitude: z.number().finite(),
  hourly_units: z.object({ time: z.literal("iso8601"), temperature_2m: z.literal("°C"),
    wind_speed_10m: z.literal("m/s"), wind_speed_100m: z.literal("m/s"), wind_direction_100m: z.literal("°") }),
  hourly: z.object({ time: z.array(z.string()).min(1).max(360),
    temperature_2m: z.array(z.number().finite().nullable()),
    wind_speed_10m: z.array(z.number().finite().nonnegative().nullable()),
    wind_speed_100m: z.array(z.number().finite().nonnegative().nullable()),
    wind_direction_100m: z.array(z.number().min(0).max(360).nullable()),
  }),
});

export function targetHours(asOf: string, horizon: 24 | 48): string[] {
  const start = utc(asOf);
  if (start % HOUR !== 0 || ![24, 48].includes(horizon)) {
    throw new WeatherError("INVALID_HORIZON", "Issue time must be hour-aligned and horizon must be 24 or 48.");
  }
  return Array.from({ length: horizon }, (_, index) => new Date(start + (index + 1) * HOUR).toISOString());
}

export function validateRun(run: SavedWeatherRun, config: WeatherConfig, asOf: string, horizon: 24 | 48): WeatherPoint[] {
  const targets = targetHours(asOf, horizon);
  validateConfig({ ...config, availability: run.availability });
  const init = utc(run.initialized_at);
  if (run.source !== "open-meteo-single-runs" || run.model !== "ecmwf_ifs" ||
      run.latitude !== config.latitude || run.longitude !== config.longitude ||
      init < ARCHIVE_START || init % (6 * HOUR) !== 0 || utc(run.downloaded_at) < init ||
      run.published_at !== null || run.request_url !== runUrl(config, run.initialized_at) ||
      run.available_at !== availableAt(run.initialized_at, run.downloaded_at, run.availability) ||
      !samePolicy(run.availability, config.availability)) {
    throw new WeatherError("INVALID_PROVENANCE", "Weather provenance or availability policy does not match.");
  }
  if (utc(run.available_at) > utc(asOf) || init > utc(asOf)) {
    throw new WeatherError("RUN_AFTER_AS_OF", "Run was not available at the forecast issue time.");
  }
  const bytes = Buffer.from(run.raw_base64, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== run.sha256) {
    throw new WeatherError("HASH_MISMATCH", "Saved weather artifact failed integrity verification.");
  }
  let parsed: z.infer<typeof responseSchema>;
  try { parsed = responseSchema.parse(JSON.parse(bytes.toString("utf8"))); }
  catch { throw new WeatherError("INVALID_RESPONSE", "Weather fields, units or JSON are invalid."); }
  const hourly = parsed.hourly;
  if (FIELDS.some(field => hourly[field].length !== hourly.time.length)) {
    throw new WeatherError("INVALID_RESPONSE", "Weather arrays have inconsistent lengths.");
  }
  const rows = new Map<string, number>();
  let previous = -Infinity;
  hourly.time.forEach((value, index) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(value)) throw new WeatherError("INVALID_RESPONSE", "Invalid hourly timestamp.");
    const time = utc(`${value}:00Z`);
    if (time < init || time <= previous) throw new WeatherError("INVALID_RESPONSE", "Weather times must be unique, ordered and after initialization.");
    previous = time;
    rows.set(new Date(time).toISOString(), index);
  });
  return targets.map(target_time => {
    const index = rows.get(target_time);
    if (index === undefined || FIELDS.some(field => hourly[field][index] === null)) {
      throw new WeatherError("INCOMPLETE_HORIZON", "Run does not cover every required target hour and field.");
    }
    return { target_time, temperature_2m: hourly.temperature_2m[index]!, wind_speed_10m: hourly.wind_speed_10m[index]!,
      wind_speed_100m: hourly.wind_speed_100m[index]!, wind_direction_100m: hourly.wind_direction_100m[index]! };
  });
}

export async function selectWeatherRun(connector: OpenMeteoWeather, repository: WeatherRepository,
  asOf: string, horizon: 24 | 48): Promise<{ run: SavedWeatherRun; points: WeatherPoint[]; fallback: boolean; reason: string | null }> {
  targetHours(asOf, horizon);
  let reason = "NO_ARCHIVED_RUN";
  for (const candidate of connector.list_runs(asOf)) {
    let run: SavedWeatherRun;
    let points: WeatherPoint[];
    try {
      run = await connector.fetch_run(candidate.run_id, asOf);
      points = validateRun(run, connector.config, asOf, horizon);
    } catch (error) {
      if (!(error instanceof WeatherError)) throw error;
      reason = error.code;
      if (reason === "PROVIDER_ERROR") break;
      continue;
    }
    try { await repository.save(run); }
    catch { throw new WeatherError("PERSISTENCE_ERROR", "Weather artifact could not be durably saved."); }
    return { run, points, fallback: false, reason: null };
  }
  let saved: SavedWeatherRun[];
  try { saved = await repository.list_saved(connector.config, asOf); }
  catch { throw new WeatherError("PERSISTENCE_ERROR", "Saved weather could not be read."); }
  const admissible: { run: SavedWeatherRun; points: WeatherPoint[] }[] = [];
  for (const run of saved) {
    try { admissible.push({ run, points: validateRun(run, connector.config, asOf, horizon) }); }
    catch { /* An untrusted or corrupt cache entry is never a fallback. */ }
  }
  admissible.sort((a, b) => utc(b.run.initialized_at) - utc(a.run.initialized_at) || a.run.sha256.localeCompare(b.run.sha256));
  if (admissible[0]) return { ...admissible[0], fallback: true, reason };
  throw new WeatherError("NO_ADMISSIBLE_RUN", `No complete admissible archived weather run (${reason}).`);
}
