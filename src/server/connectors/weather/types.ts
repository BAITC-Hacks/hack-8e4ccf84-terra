// S03-local integration port. S01 owns the canonical contracts and PostgreSQL adapter.
export type AvailabilityPolicy =
  | { kind: "observed" }
  | { kind: "assumed"; delayHours: number; rationale: string; approvalReference: string };

export interface WeatherConfig {
  latitude: number;
  longitude: number;
  availability: AvailabilityPolicy;
  lookbackHours?: number;
}

export interface RunCandidate {
  run_id: string;
  initialized_at: string;
  // A cycle is a candidate, not proof that the archive contains it.
  available_at: string | null;
}

export interface SavedWeatherRun {
  source: "open-meteo-single-runs";
  model: "ecmwf_ifs";
  latitude: number;
  longitude: number;
  initialized_at: string;
  available_at: string;
  published_at: null; // The API does not report historical publication timestamps.
  downloaded_at: string;
  availability: AvailabilityPolicy;
  request_url: string;
  raw_base64: string;
  sha256: string;
}

export interface WeatherPoint {
  target_time: string;
  temperature_2m: number;
  wind_speed_10m: number;
  wind_speed_100m: number;
  wind_direction_100m: number;
}

export interface WeatherRepository {
  // S01 must atomically persist raw bytes/hash + metadata; never overwrite a revision.
  save(run: SavedWeatherRun): Promise<void>;
  // Query by source/model/location and available_at <= asOf, including older runs.
  list_saved(config: WeatherConfig, asOf: string): Promise<SavedWeatherRun[]>;
}

export class WeatherError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WeatherError";
    this.code = code;
  }
}
