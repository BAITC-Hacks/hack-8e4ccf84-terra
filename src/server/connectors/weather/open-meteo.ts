import { createHash } from "node:crypto";
import { WeatherError } from "./types";
import type { AvailabilityPolicy, RunCandidate, SavedWeatherRun, WeatherConfig } from "./types";

export const HOUR = 3_600_000;
export const ARCHIVE_START = Date.parse("2024-03-14T00:00:00Z");
export const FIELDS = ["temperature_2m", "wind_speed_10m", "wind_speed_100m", "wind_direction_100m"] as const;
export const ENDPOINT = "https://single-runs-api.open-meteo.com/v1/forecast";

export function utc(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new WeatherError("INVALID_TIME", "Expected an explicit UTC timestamp.");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")) {
    throw new WeatherError("INVALID_TIME", "Invalid UTC timestamp.");
  }
  return timestamp;
}

export function validateConfig(config: WeatherConfig): void {
  if (!Number.isFinite(config.latitude) || Math.abs(config.latitude) > 90 ||
      !Number.isFinite(config.longitude) || Math.abs(config.longitude) > 180) {
    throw new WeatherError("INVALID_LOCATION", "Explicit valid coordinates are required.");
  }
  const hours = config.lookbackHours ?? 48;
  if (!Number.isInteger(hours) || hours < 6 || hours > 120) {
    throw new WeatherError("INVALID_POLICY", "Lookback must be 6–120 hours.");
  }
  const policy = config.availability;
  if (!policy || !["observed", "assumed"].includes(policy.kind) ||
      (policy.kind === "assumed" && (!Number.isFinite(policy.delayHours) || policy.delayHours < 1 ||
        policy.delayHours > 48 || !policy.rationale?.trim() || !policy.approvalReference?.trim()))) {
    throw new WeatherError("INVALID_POLICY", "Historical delay requires an explicit rationale and approval reference.");
  }
}

export function availableAt(initializedAt: string, downloadedAt: string, policy: AvailabilityPolicy): string {
  return new Date(policy.kind === "assumed"
    ? utc(initializedAt) + policy.delayHours * HOUR
    : utc(downloadedAt)).toISOString();
}

export function runUrl(config: WeatherConfig, initializedAt: string): string {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    latitude: String(config.latitude), longitude: String(config.longitude), models: "ecmwf_ifs",
    run: initializedAt.slice(0, 16), hourly: FIELDS.join(","), wind_speed_unit: "ms",
    temperature_unit: "celsius", timezone: "GMT", forecast_hours: "120",
  }).toString();
  return url.toString();
}

export class OpenMeteoWeather {
  readonly config: WeatherConfig;
  constructor(config: WeatherConfig, private readonly http: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date()) {
    validateConfig(config);
    this.config = structuredClone(config);
  }

  list_runs(as_of: string): RunCandidate[] {
    const asOf = utc(as_of);
    const policy = this.config.availability;
    const latest = asOf - (policy.kind === "assumed" ? policy.delayHours * HOUR : 0);
    const result: RunCandidate[] = [];
    for (let time = Math.floor(latest / (6 * HOUR)) * 6 * HOUR;
      time >= Math.max(ARCHIVE_START, latest - (this.config.lookbackHours ?? 48) * HOUR); time -= 6 * HOUR) {
      const initialized_at = new Date(time).toISOString();
      result.push({ run_id: initialized_at, initialized_at, available_at: policy.kind === "assumed"
        ? availableAt(initialized_at, initialized_at, policy) : null });
    }
    return result;
  }

  async fetch_run(run_id: string, as_of: string): Promise<SavedWeatherRun> {
    return this.fetchRun(run_id, as_of, true);
  }

  /** Download for archival storage only. Historical admissibility is not asserted. */
  async fetch_archive(run_id: string): Promise<SavedWeatherRun> {
    return this.fetchRun(run_id, this.now().toISOString(), false);
  }

  private async fetchRun(run_id: string, as_of: string, enforceAvailability: boolean): Promise<SavedWeatherRun> {
    const time = utc(run_id);
    const asOf = utc(as_of);
    if (time < ARCHIVE_START || time % (6 * HOUR) !== 0) {
      throw new WeatherError("INVALID_RUN", "Run must be an archived ECMWF UTC cycle.");
    }
    const initialized_at = new Date(time).toISOString();
    const policy = this.config.availability;
    if (time > asOf || (enforceAvailability && policy.kind === "assumed" && utc(availableAt(initialized_at, initialized_at, policy)) > asOf)) {
      throw new WeatherError("RUN_AFTER_AS_OF", "Run was not available at the forecast issue time.");
    }
    const request_url = runUrl(this.config, initialized_at);
    let bytes: Buffer;
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await this.http(request_url, { signal: AbortSignal.timeout(15_000), cache: "no-store", redirect: "error" });
        if (!response.ok) {
          if (response.status !== 429 && response.status < 500)
            throw new WeatherError("ARCHIVE_UNAVAILABLE", "Requested archived run is unavailable or access was denied.");
          throw new WeatherError("PROVIDER_ERROR", "Archived weather request failed temporarily.");
        }
        bytes = Buffer.from(await response.arrayBuffer());
        break;
      } catch (error) {
        if (error instanceof WeatherError && error.code === "ARCHIVE_UNAVAILABLE") throw error;
        if (attempt >= 2)
          throw new WeatherError("PROVIDER_ERROR", "Archived weather is unavailable after three attempts.");
        await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
    const downloaded_at = this.now().toISOString();
    if (utc(downloaded_at) < time) throw new WeatherError("INVALID_TIME", "Download clock precedes initialization.");
    const available_at = availableAt(initialized_at, downloaded_at, policy);
    if (enforceAvailability && utc(available_at) > asOf) {
      throw new WeatherError("RUN_AFTER_AS_OF", "Observed download became available after the forecast issue time.");
    }
    return {
      source: "open-meteo-single-runs", model: "ecmwf_ifs", latitude: this.config.latitude,
      longitude: this.config.longitude, initialized_at, available_at,
      published_at: null, downloaded_at, availability: structuredClone(policy), request_url,
      raw_base64: bytes.toString("base64"), sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
}
