import postgres from "postgres";
import type {ModelVersion} from "../contracts";
import {PostgresObservationReader, PostgresWeatherRunReader} from "../data/snapshot/postgres-readers";
import {PostgresForecastStore} from "./postgres-store";
import {ForecastService} from "./service";
import type {ForecastInference} from "./inference";
import {createApprovedInference} from "./approved-inference";

let sql: ReturnType<typeof postgres> | undefined;
export function forecastDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  sql ??= postgres(process.env.DATABASE_URL, {max: 5, connect_timeout: 5});
  return sql;
}

export async function resolveForecastModelId(requested: string): Promise<string> {
  if (requested !== "baseline") return requested;
  const db = forecastDatabase();
  await db`
    INSERT INTO model_versions (name, version, status, code_version,
      feature_spec, parameters)
    VALUES ('persistence', '1', 'approved', 'baseline-persistence-v1',
      '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (name, version) DO NOTHING`;
  const rows = await db`
    SELECT id FROM model_versions WHERE name = 'persistence'
      AND version = '1' AND status = 'approved'`;
  if (!rows.length) throw new Error("MODEL_NOT_APPROVED");
  return rows[0].id as string;
}

export async function loadForecastModel(db: ReturnType<typeof postgres>, modelId: string): Promise<ModelVersion> {
  const rows = await db`SELECT * FROM model_versions WHERE id = ${modelId} AND status = 'approved'`;
  if (!rows.length) throw new Error("MODEL_NOT_APPROVED");
  const row = rows[0];
  return {id: row.id, name: row.name, version: row.version,
    status: row.status, artifactId: row.artifact_id, codeVersion: row.code_version,
    featureSpec: row.feature_spec, trainingCutoff: row.training_cutoff?.toISOString() ?? null,
    parameters: row.parameters, metrics: row.metrics};
}

export async function forecastRuntime(modelId: string,
  inference?: ForecastInference): Promise<ForecastService> {
  const db = forecastDatabase();
  const model = await loadForecastModel(db, modelId);
  return new ForecastService(new PostgresObservationReader(db),
    new PostgresWeatherRunReader(db), new PostgresForecastStore(db),
    process.env.FORECAST_CONFIG_VERSION || "baseline-v1", model, inference ?? createApprovedInference(db));
}
