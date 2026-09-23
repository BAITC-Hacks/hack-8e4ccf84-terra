import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { z } from "zod";
import { OpenMeteoWeather, HOUR, utc } from "../src/server/connectors/weather/open-meteo";
import { PostgresWeatherIngestion } from "../src/server/connectors/weather/ingestion";
import { WeatherError } from "../src/server/connectors/weather/types";

const schema = z.object({
  assetIds: z.array(z.uuid()).min(1), start: z.string(), end: z.string(),
  timeZone: z.literal("UTC"),
  stepHours: z.number().int().min(1).max(168), horizonHours: z.union([z.literal(24), z.literal(48)]),
  mode: z.enum(["official", "research"]),
  availability: z.discriminatedUnion("kind", [z.object({ kind: z.literal("observed") }),
    z.object({ kind: z.literal("assumed"), delayHours: z.number().min(1).max(48), rationale: z.string().min(1), approvalReference: z.string().min(1) })]),
}).strict();

async function main() {
  const filename = process.argv[2];
  if (!filename) throw new WeatherError("INVALID_CONFIG", "Usage: node --import tsx scripts/weather-ingest.ts config.json");
  const config = schema.parse(JSON.parse(await readFile(filename, "utf8")));
  const start = utc(config.start), end = utc(config.end);
  if (start > end || start % HOUR || end % HOUR || (end - start) / (config.stepHours * HOUR) > 1000)
    throw new WeatherError("INVALID_RANGE", "Use an hourly UTC range with at most 1001 issues.");
  if (config.mode === "official" && config.availability.kind === "assumed")
    throw new WeatherError("INVALID_POLICY", "Research assumptions cannot be used for official ingestion.");
  if (!process.env.DATABASE_URL) throw new WeatherError("MISSING_DATABASE", "DATABASE_URL is required.");
  const sql = postgres(process.env.DATABASE_URL, { max: 2, connect_timeout: 5 });
  try {
    const store = new PostgresWeatherIngestion(sql);
    for (const assetId of [...new Set(config.assetIds)]) {
      const [asset] = await sql`SELECT latitude, longitude FROM assets WHERE id = ${assetId}`;
      for (let issue = start; issue <= end; issue += config.stepHours * HOUR) {
        const issuedAt = new Date(issue).toISOString();
        let reason = "NO_ARCHIVED_RUN";
        let result: Awaited<ReturnType<typeof store.save>> | undefined;
        if (!asset || asset.latitude === null || asset.longitude === null) reason = "MISSING_ASSET_COORDINATES";
        else {
          const connector = new OpenMeteoWeather({ latitude: Number(asset.latitude), longitude: Number(asset.longitude), availability: config.availability });
          for (const candidate of connector.list_runs(issuedAt)) {
            try {
              // Fetch now for archival storage; eligibility remains separately BLOCKED, never inferred from this clock.
              const run = await connector.fetch_archive(candidate.run_id);
              result = await store.save(assetId, run, issuedAt, config.horizonHours);
              reason = result.reason;
              break;
            } catch (error) {
              if (!(error instanceof WeatherError)) throw error;
              reason = error.code;
              if (reason === "PROVIDER_ERROR") break;
            }
          }
        }
        console.log(JSON.stringify({ assetId, issuedAt, horizonHours: config.horizonHours, mode: config.mode,
          status: "BLOCKED", coverage: result ? 1 : 0, ...result, reason }));
        process.exitCode = 2;
      }
    }
  } finally { await sql.end(); }
}
main().catch(error => {
  console.error(JSON.stringify({ status: "BLOCKED", reason: error instanceof WeatherError ? error.code : "INGESTION_FAILED" }));
  process.exitCode = 1;
});
