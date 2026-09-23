import type postgres from "postgres";
import type { Observation, WeatherRun, WeatherValue } from "../contracts";
import { buildForecastSnapshot, type ForecastInputSnapshot } from "../data/snapshot/build";
import type { JobPayload } from "../jobs/types";
import type { TriggerConfig } from "./config";

const iso = (value: Date | string) => new Date(value).toISOString();

/** One asset per job: the existing payload can pin exactly one weatherRunId.
 * Discover every complete run with the latest relevant measurement, including late imports.
 * Superseded measurements/revisions are not new inputs; earlier discoveries remain durable.
 * No evaluation-only tables are read here.
 */
export async function discoverIssue(sql: postgres.ISql, config: TriggerConfig, issuedAt: string,
  now: string, signal: AbortSignal,
  save: (payload: JobPayload, snapshot: ForecastInputSnapshot) => Promise<void>): Promise<void> {
  for (const assetId of [...config.assetIds].sort()) {
    signal.throwIfAborted();
    const observations = await sql`SELECT * FROM observations o
      WHERE asset_id = ${assetId} AND metric = 'normalized_power'
        AND event_time <= ${issuedAt} AND available_at <= ${issuedAt}
        AND quality_flag = 'accepted' AND value NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
        AND NOT (${config.mode === "backtest"} AND event_time >= '2026-02-01T00:00:00Z')
        AND NOT EXISTS (SELECT 1 FROM observations newer WHERE newer.asset_id = o.asset_id
          AND newer.metric = o.metric AND (newer.event_time > o.event_time
            OR (newer.event_time = o.event_time AND newer.revision > o.revision))
          AND newer.event_time <= ${issuedAt} AND newer.available_at <= ${issuedAt}
          AND newer.quality_flag = 'accepted'
          AND newer.value NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
          AND NOT (${config.mode === "backtest"} AND newer.event_time >= '2026-02-01T00:00:00Z'))
      ORDER BY event_time, revision, id`;
    if (!observations.length) continue;
    const runs = await sql`SELECT * FROM weather_runs WHERE asset_id = ${assetId}
      AND available_at <= ${issuedAt} AND published_at <= ${issuedAt}
      AND (run_time IS NULL OR run_time <= ${issuedAt}) ORDER BY available_at, id`;
    for (const row of runs) {
      signal.throwIfAborted();
      const run: WeatherRun = { id: row.id, assetId, provider: row.provider, model: row.model,
        runTime: row.run_time ? iso(row.run_time) : null, publishedAt: iso(row.published_at),
        availableAt: iso(row.available_at), fetchedAt: iso(row.fetched_at),
        rawArtifactId: row.raw_artifact_id, availabilityAssumption: row.availability_assumption };
      for (const horizonHours of config.horizons) {
        const end = new Date(Date.parse(issuedAt) + horizonHours * 3_600_000).toISOString();
        const values = await sql`SELECT * FROM weather_values WHERE run_id = ${run.id}
          AND target_time > ${issuedAt} AND target_time <= ${end} AND metric = 'wind_speed'
          ORDER BY target_time, height_metres NULLS FIRST`;
        const weatherValues: WeatherValue[] = values.map((value) => ({ runId: run.id,
          targetTime: iso(value.target_time), metric: value.metric, value: Number(value.value),
          unit: value.unit, heightMetres: value.height_metres === null ? null : Number(value.height_metres) }));
        // Ambiguous heights/duplicates must be resolved by ingestion, not arbitrary row order.
        if (weatherValues.length !== horizonHours || new Set(weatherValues.map((v) => v.targetTime)).size !== horizonHours) continue;
        for (const item of observations) {
          const observation: Observation = { id: item.id, assetId, metric: item.metric,
            value: Number(item.value), unit: item.unit, eventTime: iso(item.event_time),
            availableAt: iso(item.available_at), ingestedAt: iso(item.ingested_at),
            revision: Number(item.revision), qualityFlag: item.quality_flag,
            sourceTimeZone: item.source_time_zone, availabilityAssumption: item.availability_assumption,
            rawArtifactId: item.raw_artifact_id };
          const request = { assetIds: [assetId], issuedAt, horizonHours, mode: config.mode,
            modelVersionId: config.modelVersionId, dataPolicy: "history_only" as const };
          const snapshot = await buildForecastSnapshot(request,
            { listAvailable: async () => [observation] },
            { listRuns: async () => [run], readValues: async () => weatherValues }, config.configVersion, now);
          if (snapshot.missing.length) continue;
          const eventKey = `input-trigger:v1:${config.mode}:${assetId}:${issuedAt}:${horizonHours}:` +
            `${config.modelVersionId}:${encodeURIComponent(config.configVersion)}:${snapshot.sha256}`;
          signal.throwIfAborted();
          await save({ ...request, configVersion: config.configVersion, eventKey, weatherRunId: run.id }, snapshot);
        }
      }
    }
  }
}
