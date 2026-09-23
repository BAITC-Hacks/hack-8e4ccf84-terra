import {and, eq} from "drizzle-orm";
import {closeDatabase, db} from "../../src/db/client";
import {observations} from "../../src/db/schema";
import {PostgresImportRepository} from "../../src/server/data/import/postgres-repository";
import {CsvImportService} from "../../src/server/data/import/service";

async function main() {
  const repository = new PostgresImportRepository();
  const service = new CsvImportService(
    repository,
    {saveRaw: async (sha256) => `validation://${sha256}`},
    1,
  );
  const config = {
    assetId: "postgres-smoke-turbine",
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
  console.log(JSON.stringify({importId: first.id, accepted: first.report.accepted, observations: stored.length}));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
