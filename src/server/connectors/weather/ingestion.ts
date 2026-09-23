import { createHash } from "node:crypto";
import { z } from "zod";
import type postgres from "postgres";
import type { AvailabilityAssumption, WeatherValue } from "../../contracts";
import { targetHours } from "../../data/weather/selection";
import { ARCHIVE_START, FIELDS, HOUR, runUrl, utc, validateConfig } from "./open-meteo";
import type { SavedWeatherRun } from "./types";
import { WeatherError } from "./types";

const responseSchema = z.object({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  utc_offset_seconds: z.literal(0),
  hourly_units: z.object({ time: z.literal("iso8601"), temperature_2m: z.literal("°C"),
    wind_speed_10m: z.literal("m/s"), wind_speed_100m: z.literal("m/s"), wind_direction_100m: z.literal("°") }),
  hourly: z.object({ time: z.array(z.string()).min(1).max(360),
    temperature_2m: z.array(z.number().finite()), wind_speed_10m: z.array(z.number().finite().nonnegative()),
    wind_speed_100m: z.array(z.number().finite().nonnegative()), wind_direction_100m: z.array(z.number().min(0).max(360)) }),
});

/** Validate archive structure independently of historical eligibility. Never invent publication evidence. */
export function canonicalWeatherValues(run: SavedWeatherRun, issuedAt: string, horizonHours: 24 | 48): Omit<WeatherValue, "runId">[] {
  const targets = targetHours(issuedAt, horizonHours);
  validateConfig({ latitude: run.latitude, longitude: run.longitude, availability: run.availability });
  const initialized = utc(run.initialized_at);
  if (run.source !== "open-meteo-single-runs" || run.model !== "ecmwf_ifs" || run.published_at !== null ||
      initialized < ARCHIVE_START || initialized % (6 * HOUR) !== 0 || initialized > utc(issuedAt) || utc(run.downloaded_at) < initialized ||
      run.request_url !== runUrl({ ...run, availability: run.availability }, run.initialized_at))
    throw new WeatherError("INVALID_PROVENANCE", "Expected an archived ECMWF single run with unknown publication.");
  const bytes = Buffer.from(run.raw_base64, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== run.sha256)
    throw new WeatherError("HASH_MISMATCH", "Weather raw artifact hash mismatch.");
  let data: z.infer<typeof responseSchema>;
  try { data = responseSchema.parse(JSON.parse(bytes.toString("utf8"))); }
  catch { throw new WeatherError("INVALID_RESPONSE", "Invalid weather fields, values or units."); }
  // The provider returns the selected grid cell, not the requested point. Reject distant cells.
  const deltaLon = Math.min(Math.abs(data.longitude - run.longitude), 360 - Math.abs(data.longitude - run.longitude));
  if (Math.abs(data.latitude - run.latitude) > 0.25 || deltaLon * Math.cos(run.latitude * Math.PI / 180) > 0.25)
    throw new WeatherError("INVALID_LOCATION", "Provider grid cell is too far from the requested coordinates.");
  const hourly = data.hourly;
  if (FIELDS.some(field => hourly[field].length !== hourly.time.length))
    throw new WeatherError("INVALID_RESPONSE", "Weather arrays have inconsistent lengths.");
  const times = hourly.time.map(value => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(value)) throw new WeatherError("INVALID_TIME", "Expected hourly UTC values.");
    return utc(`${value}:00Z`);
  });
  if (times[0] !== initialized || times.some((time, index) => index > 0 && time !== times[index - 1] + HOUR))
    throw new WeatherError("INVALID_RESPONSE", "Weather hours must be continuous and unique from initialization.");
  if (!targets.every(target => times.includes(utc(target))))
    throw new WeatherError("INCOMPLETE_HORIZON", "Archive does not cover the complete requested horizon.");
  return times.flatMap((time, index) => [
    { metric: "temperature", value: hourly.temperature_2m[index], unit: "°C", heightMetres: 2 },
    // Keep one canonical wind_speed height: the current consumer does not select a height.
    { metric: "wind_speed", value: hourly.wind_speed_100m[index], unit: "m/s", heightMetres: 100 },
    { metric: "wind_speed_10m", value: hourly.wind_speed_10m[index], unit: "m/s", heightMetres: 10 },
    { metric: "wind_direction", value: hourly.wind_direction_100m[index], unit: "°", heightMetres: 100 },
  ].map(value => ({ ...value, targetTime: new Date(time).toISOString() })));
}

export class PostgresWeatherIngestion {
  constructor(private readonly sql: ReturnType<typeof postgres>) {}

  async save(assetId: string, run: SavedWeatherRun, issuedAt: string, horizonHours: 24 | 48) {
    const values = canonicalWeatherValues(run, issuedAt, horizonHours);
    const policy = run.availability;
    const assumption = policy.kind === "assumed" ? {
      kind: "research_only", parameters: { delayHours: policy.delayHours, approvalReference: policy.approvalReference,
        assumedAvailableAt: new Date(utc(run.initialized_at) + policy.delayHours * HOUR).toISOString() }, rationale: policy.rationale,
    } satisfies AvailabilityAssumption : null;
    // Unknown historical availability stays NULL; fetched_at is observation time, not historical evidence.
    const identity = createHash("sha256").update(JSON.stringify([assetId, run.source, run.model,
      run.initialized_at, run.sha256, run.latitude, run.longitude, assumption])).digest("hex");
    return this.sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`;
      const [asset] = await tx`SELECT latitude, longitude FROM assets WHERE id = ${assetId} FOR SHARE`;
      if (!asset || asset.latitude === null || asset.longitude === null ||
          Number(asset.latitude) !== run.latitude || Number(asset.longitude) !== run.longitude)
        throw new WeatherError("INVALID_LOCATION", "Asset coordinates must match the weather request.");
      const path = `postgres:weather/${identity}`;
      const [existing] = await tx`SELECT w.id FROM weather_runs w JOIN raw_artifacts a ON a.id = w.raw_artifact_id
        WHERE a.path = ${path} AND a.sha256 = ${run.sha256} AND w.asset_id = ${assetId}`;
      if (existing) return { runId: existing.id as string, inserted: false, hours: values.length / 4,
        officialEligible: false as const, reason: "UNKNOWN_HISTORICAL_PUBLICATION" };
      const metadata = { ...run, requestedIssuedAt: issuedAt, requestedHorizonHours: horizonHours, officialEligible: false };
      const [artifact] = await tx`INSERT INTO raw_artifacts (sha256, path, source, metadata)
        VALUES (${run.sha256}, ${path}, ${run.source}, ${tx.json(metadata)}) RETURNING id`;
      const [saved] = await tx`INSERT INTO weather_runs (asset_id, provider, model, run_time, published_at,
        available_at, fetched_at, raw_artifact_id, availability_assumption)
        VALUES (${assetId}, ${run.source}, ${run.model}, ${run.initialized_at}, NULL, NULL,
          ${run.downloaded_at}, ${artifact.id}, ${assumption ? tx.json(assumption) : null}) RETURNING id`;
      const rows = values.map(value => ({ run_id: saved.id as string, target_time: value.targetTime,
        metric: value.metric, value: value.value, unit: value.unit, height_metres: value.heightMetres }));
      await tx`INSERT INTO weather_values ${tx(rows)}`;
      return { runId: saved.id as string, inserted: true, hours: values.length / 4,
        officialEligible: false as const, reason: "UNKNOWN_HISTORICAL_PUBLICATION" };
    });
  }
}
