import postgres from "postgres";
import type {ForecastRequest, ForecastValue} from "../contracts";
import type {ForecastInputSnapshot} from "../data/snapshot/build";
import {validateForecastValues, type ForecastStore, type StoredForecast} from "./service";

type Sql = ReturnType<typeof postgres>;
type Query = postgres.ISql;
const iso = (value: Date | string) => new Date(value).toISOString();
const series = (request: ForecastRequest) => JSON.stringify([
  [...request.assetIds].sort(), request.issuedAt, request.horizonHours,
  request.mode, request.dataPolicy,
]);

/** S01-schema adapter. Every visible publication consists of one committed transaction. */
export class PostgresForecastStore implements ForecastStore {
  constructor(private readonly sql: Sql) {}

  async publish(input: Omit<StoredForecast, "id" | "version" | "previousVersionId">): Promise<StoredForecast> {
    if (input.status === "published" &&
      (input.snapshot.missing.length || validateForecastValues(input.request, input.values).length ||
        input.publishedAt === null)) throw new Error("INCOMPLETE_FORECAST");
    if (input.status === "incomplete" && (input.values.length || input.publishedAt !== null)) {
      throw new Error("INVALID_INCOMPLETE_FORECAST");
    }
    const assetIds = [...input.request.assetIds].sort();
    return this.sql.begin(async (tx) => {
      // Serialize a forecast series before checking the snapshot hash and assigning its version.
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${series(input.request)}, 0))`;
      const snapshotRows = await tx`
        INSERT INTO input_snapshots (issued_at, asset_ids, observation_revisions,
          weather_run_ids, payload, config_version, sha256)
        VALUES (${input.request.issuedAt}, ${tx.array(assetIds, 2950)},
          ${tx.json(input.snapshot.observationRevisions)},
          ${tx.array(input.snapshot.weatherRunIds, 2950)},
          ${tx.json(input.snapshot.payload as postgres.JSONValue)},
          ${input.snapshot.configVersion}, ${input.snapshot.sha256})
        ON CONFLICT (sha256) DO NOTHING
        RETURNING id`;
      const snapshotId = snapshotRows.length ? snapshotRows[0].id as string :
        (await tx`SELECT id FROM input_snapshots WHERE sha256 = ${input.snapshot.sha256}`)[0].id as string;
      const existing = await tx`
        SELECT id FROM forecast_runs WHERE idempotency_key = ${input.idempotencyKey}`;
      if (existing.length) return this.loadOne(tx, existing[0].id as string);
      const previous = await tx`
        SELECT id, version FROM forecast_runs
        WHERE issued_at = ${input.request.issuedAt}
          AND asset_ids = ${tx.array(assetIds, 2950)}
          AND horizon_hours = ${input.request.horizonHours}
          AND mode = ${input.request.mode} AND data_policy = ${input.request.dataPolicy}
        ORDER BY version DESC LIMIT 1`;
      const version = previous.length ? Number(previous[0].version) + 1 : 1;
      const created = await tx`
        INSERT INTO forecast_runs (issued_at, asset_ids, horizon_hours, mode,
          data_policy, input_snapshot_id, model_version_id, status, version,
          created_at, published_at, idempotency_key, previous_version_id,
          incomplete_reasons)
        VALUES (${input.request.issuedAt}, ${tx.array(assetIds, 2950)},
          ${input.request.horizonHours}, ${input.request.mode}, ${input.request.dataPolicy},
          ${snapshotId}, ${input.request.modelVersionId}, ${input.status}, ${version},
          ${input.createdAt}, ${input.publishedAt}, ${input.idempotencyKey},
          ${previous[0]?.id ?? null}, ${tx.json(input.incompleteReasons)}) RETURNING id`;
      const id = created[0].id as string;
      for (const value of input.values) {
        await tx`INSERT INTO forecast_values (forecast_run_id, asset_id, target_time,
          value, unit, quality_flag) VALUES (${id}, ${value.assetId},
          ${value.targetTime}, ${value.value}, ${value.unit}, ${value.qualityFlag})`;
      }
      return {...input, id, version, previousVersionId: previous[0]?.id ?? null,
        inputSnapshotId: snapshotId};
    });
  }

  async list(filter?: {assetId?: string; issuedAt?: string; mode?: ForecastRequest["mode"];
    horizonHours?: 24 | 48}): Promise<StoredForecast[]> {
    const rows = await this.sql`
      SELECT id FROM forecast_runs
      WHERE (${filter?.assetId ?? null}::uuid IS NULL OR ${filter?.assetId ?? null}::uuid = ANY(asset_ids))
        AND (${filter?.issuedAt ?? null}::timestamptz IS NULL OR issued_at = ${filter?.issuedAt ?? null})
        AND (${filter?.mode ?? null}::text IS NULL OR mode = ${filter?.mode ?? null})
        AND (${filter?.horizonHours ?? null}::integer IS NULL OR horizon_hours = ${filter?.horizonHours ?? null})
      ORDER BY issued_at DESC, version DESC LIMIT 100`;
    return Promise.all(rows.map((row) => this.loadOne(this.sql, row.id as string)));
  }

  private async loadOne(query: Query, id: string): Promise<StoredForecast> {
    const rows = await query`
      SELECT f.*, s.sha256, s.observation_revisions, s.weather_run_ids,
        s.payload, s.config_version, s.created_at AS snapshot_created_at
      FROM forecast_runs f JOIN input_snapshots s ON s.id = f.input_snapshot_id
      WHERE f.id = ${id}`;
    const row = rows[0];
    const request: ForecastRequest = {assetIds: row.asset_ids, issuedAt: iso(row.issued_at),
      horizonHours: row.horizon_hours, mode: row.mode, modelVersionId: row.model_version_id,
      dataPolicy: row.data_policy};
    const valueRows = await query`
      SELECT asset_id, target_time, value, unit, quality_flag
      FROM forecast_values WHERE forecast_run_id = ${id}
      ORDER BY asset_id, target_time`;
    const values: ForecastValue[] = valueRows.map((item) => ({assetId: item.asset_id,
      targetTime: iso(item.target_time), value: Number(item.value),
      unit: item.unit, qualityFlag: item.quality_flag}));
    const payload = row.payload as ForecastInputSnapshot["payload"];
    const revisions = row.observation_revisions as ForecastInputSnapshot["observationRevisions"];
    const runIds = row.weather_run_ids as string[];
    const snapshot: ForecastInputSnapshot = {id: row.input_snapshot_id,
      issuedAt: request.issuedAt, assetIds: request.assetIds, observationRevisions: revisions,
      weatherRunIds: runIds, configVersion: row.config_version, sha256: row.sha256,
      createdAt: iso(row.snapshot_created_at), payload,
      observations: payload.observations as ForecastInputSnapshot["observations"],
      weatherRuns: payload.weatherRuns as ForecastInputSnapshot["weatherRuns"],
      weatherValues: payload.weatherValues as ForecastInputSnapshot["weatherValues"],
      missing: payload.missing as string[]};
    return {id, request, inputSnapshotId: row.input_snapshot_id,
      status: row.status, version: row.version, createdAt: iso(row.created_at),
      publishedAt: row.published_at ? iso(row.published_at) : null,
      values, snapshot, previousVersionId: row.previous_version_id,
      idempotencyKey: row.idempotency_key,
      incompleteReasons: row.incomplete_reasons ?? []};
  }
}
