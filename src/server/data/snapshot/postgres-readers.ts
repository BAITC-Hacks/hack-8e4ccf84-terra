import postgres from "postgres";
import type {
  Observation, ObservationReader, WeatherRun, WeatherRunReader, WeatherValue,
} from "../../contracts";

type Sql = ReturnType<typeof postgres>;
const iso = (value: Date | string) => new Date(value).toISOString();

/** Reads canonical rows that S02 imports. Availability is enforced again by the snapshot builder. */
export class PostgresObservationReader implements ObservationReader {
  constructor(private readonly sql: Sql) {}

  async listAvailable(input: Parameters<ObservationReader["listAvailable"]>[0]): Promise<Observation[]> {
    const rows = await this.sql`
      SELECT DISTINCT ON (asset_id, metric) id, asset_id, metric, value, unit, event_time, available_at,
             ingested_at, revision, quality_flag, source_time_zone,
             availability_assumption, raw_artifact_id
      FROM observations
      WHERE asset_id = ANY(${this.sql.array(input.assetIds, 2950)})
        AND metric = ANY(${this.sql.array(input.metrics, 25)})
        AND event_time >= ${input.from} AND event_time <= ${input.to}
        AND available_at IS NOT NULL AND available_at <= ${input.asOf}
        AND quality_flag = 'accepted'
      ORDER BY asset_id, metric, event_time DESC, revision DESC`;
    return rows.map((row) => ({
      id: row.id, assetId: row.asset_id, metric: row.metric, value: Number(row.value),
      unit: row.unit, eventTime: iso(row.event_time),
      availableAt: row.available_at ? iso(row.available_at) : null,
      ingestedAt: iso(row.ingested_at), revision: row.revision,
      qualityFlag: row.quality_flag, sourceTimeZone: row.source_time_zone,
      availabilityAssumption: row.availability_assumption, rawArtifactId: row.raw_artifact_id,
    }));
  }
}

/** Reads persisted S03 runs and hourly values, never future observed weather. */
export class PostgresWeatherRunReader implements WeatherRunReader {
  constructor(private readonly sql: Sql) {}

  async listRuns(input: Parameters<WeatherRunReader["listRuns"]>[0]): Promise<WeatherRun[]> {
    const rows = await this.sql`
      SELECT id, asset_id, provider, model, run_time, published_at, available_at,
             fetched_at, raw_artifact_id, availability_assumption
      FROM weather_runs
      WHERE asset_id = ANY(${this.sql.array(input.assetIds, 2950)})
        AND available_at <= ${input.asOf}
      ORDER BY available_at DESC, id DESC`;
    return rows.map((row) => ({
      id: row.id, assetId: row.asset_id, provider: row.provider, model: row.model,
      runTime: row.run_time ? iso(row.run_time) : null,
      publishedAt: row.published_at ? iso(row.published_at) : null,
      availableAt: row.available_at ? iso(row.available_at) : null,
      fetchedAt: iso(row.fetched_at), rawArtifactId: row.raw_artifact_id,
      availabilityAssumption: row.availability_assumption,
    }));
  }

  async readValues(runId: string, from: string, to: string): Promise<WeatherValue[]> {
    const rows = await this.sql`
      SELECT run_id, target_time, metric, value, unit, height_metres
      FROM weather_values
      WHERE run_id = ${runId} AND target_time >= ${from} AND target_time <= ${to}
      ORDER BY target_time`;
    return rows.map((row) => ({runId: row.run_id, targetTime: iso(row.target_time),
      metric: row.metric, value: Number(row.value), unit: row.unit,
      heightMetres: row.height_metres === null ? null : Number(row.height_metres)}));
  }
}
