import {and, eq} from "drizzle-orm";
import {randomUUID} from "node:crypto";
import postgres from "postgres";
import {closeDatabase, db} from "../../src/db/client";
import {observations} from "../../src/db/schema";
import {PostgresImportRepository} from "../../src/server/data/import/postgres-repository";
import {CsvImportService} from "../../src/server/data/import/service";
import {PostgresObservationReader, PostgresWeatherRunReader} from "../../src/server/data/snapshot/postgres-readers";
import {PostgresForecastStore} from "../../src/server/forecast/postgres-store";
import {ForecastService} from "../../src/server/forecast/service";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {max: 1});
  const assetId = randomUUID();
  await sql`INSERT INTO assets (id, kind, name) VALUES (${assetId}, 'turbine', 'Import bridge smoke')`;
  const repository = new PostgresImportRepository();
  const service = new CsvImportService(
    repository,
    {saveRaw: async (sha256) => `validation://${sha256}`},
    1,
  );
  const config = {
    assetId,
    dialect: {encoding: "utf-8" as const, delimiter: ",", decimalSeparator: "." as const},
    mapping: {
      timestamp: "time",
      windSpeed: "wind",
      normalizedPower: "power",
      ambientTemperature: "temperature",
    },
    time: {
      format: "yyyy-MM-dd HH:mm:ss" as const,
      timeZone: "UTC",
      timestampMeaning: "interval_start" as const,
      sourceIntervalMinutes: 10,
      availabilityLagMinutes: 10,
      availabilityAssumption: "available after interval",
    },
    units: {
      windSpeed: "m/s" as const,
      normalizedPower: "normalized" as const,
      ambientTemperature: "degC" as const,
    },
    hourlyCoverageThreshold: 1,
    confirmed: true,
  };
  const bytes = new TextEncoder().encode(
    "time,wind,power,temperature\n2025-01-01 00:00:00,5,0.4,10\n",
  );
  const first = await service.import({bytes, fileName: "smoke.csv", config});
  const second = await service.import({bytes, fileName: "smoke.csv", config});
  if ("requiresConfirmation" in first || "requiresConfirmation" in second || first.id !== second.id)
    throw new Error("Repeated production import was not idempotent.");
  const stored = await db().select().from(observations).where(and(
    eq(observations.assetId, config.assetId),
    eq(observations.eventTime, new Date("2025-01-01T00:00:00Z")),
  ));
  if (stored.length !== 3) throw new Error(`Expected 3 observations, received ${stored.length}.`);
  const canonical = await sql`SELECT metric, value, unit FROM observations
    WHERE asset_id = ${assetId} ORDER BY metric`;
  if (canonical.length !== 3 || !canonical.some((row) => row.metric === "normalized_power")) {
    throw new Error("Completed CSV import was not mirrored into canonical forecast observations.");
  }
  const rawId = randomUUID();
  const weatherId = randomUUID();
  const modelId = randomUUID();
  const issuedAt = "2025-01-01T01:00:00.000Z";
  await sql`INSERT INTO raw_artifacts (id, sha256, path, source)
    VALUES (${rawId}, ${"b".repeat(64)}, 'validation://weather', 'postgres-smoke')`;
  await sql`INSERT INTO model_versions (id, name, version, status, code_version)
    VALUES (${modelId}, 'persistence', 'postgres-smoke', 'approved', 'postgres-smoke')`;
  await sql`INSERT INTO weather_runs (id, asset_id, provider, model, run_time,
    published_at, available_at, raw_artifact_id)
    VALUES (${weatherId}, ${assetId}, 'fixture', 'fixture-model',
      '2024-12-31T22:00:00Z', '2024-12-31T23:00:00Z', '2024-12-31T23:00:00Z', ${rawId})`;
  for (let lead = 1; lead <= 24; lead++) {
    const target = new Date(Date.parse(issuedAt) + lead * 3_600_000).toISOString();
    await sql`INSERT INTO weather_values (run_id, target_time, metric, value, unit)
      VALUES (${weatherId}, ${target}, 'wind_speed', 6, 'm/s')`;
  }
  const model = {id: modelId, name: "persistence", version: "postgres-smoke",
    status: "approved" as const, artifactId: null, codeVersion: "postgres-smoke",
    featureSpec: {}, trainingCutoff: null, parameters: {}, metrics: null};
  const forecast = await new ForecastService(
    new PostgresObservationReader(sql),
    new PostgresWeatherRunReader(sql),
    new PostgresForecastStore(sql),
    "postgres-smoke",
    model,
  ).run({assetIds: [assetId], issuedAt, horizonHours: 24, mode: "backtest",
    modelVersionId: modelId, dataPolicy: "history_only"});
  if (forecast.status !== "published" || forecast.values.length !== 24
    || forecast.values.some((point) => point.value !== 0.4 || point.unit !== "normalized")) {
    throw new Error("Imported power did not produce the expected persisted 24-hour forecast.");
  }
  const unknown = await service.import({bytes, fileName: "unknown-asset.csv",
    config: {...config, assetId: randomUUID()}});
  if ("requiresConfirmation" in unknown || unknown.report.rejected !== 1
    || unknown.report.reasons.unknown_asset !== 1) {
    throw new Error("Unknown catalogue asset was not rejected with an explicit import reason.");
  }
  console.log(JSON.stringify({importId: first.id, accepted: first.report.accepted,
    observations: stored.length, canonical: canonical.length, forecastPoints: forecast.values.length}));
  await sql.end();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
