import type postgres from "postgres";
import { PostgresAgentPorts } from "../../agent/adapters";
import { PostgresJobStore } from "../../jobs/postgres-store";
import { PostgresForecastStore } from "../../forecast/postgres-store";
import { StepError } from "../../agent/workflow";
import type { BatchAdapter } from "./index";

/** Uses the existing durable agent store and canonical forecast reader. Dispatcher runs separately. */
export function postgresBatchAdapter(sql: ReturnType<typeof postgres>): BatchAdapter {
  const forecasts = new PostgresForecastStore(sql);
  return {
    synthetic: false, jobs: new PostgresJobStore(sql),
    async preflight(request) {
      const versions = { weatherRunIds: [] as string[], observationRevisions: [] as
        Array<{ observationId: string; revision: number }> };
      const models = await sql`SELECT name, status, training_cutoff FROM model_versions WHERE id = ${request.modelVersionId}`;
      if (!models.length || models[0].status !== "approved") return { versions, missing: ["MODEL_NOT_APPROVED"] };
      const cutoff = models[0].training_cutoff ? new Date(models[0].training_cutoff).toISOString() : null;
      if (!cutoff && models[0].name !== "persistence") return { versions, missing: ["MODEL_TRAINING_CUTOFF_UNKNOWN"] };
      if (cutoff && (cutoff >= "2026-02-01T00:00:00.000Z" || cutoff > request.issuedAt)) {
        return { versions, missing: ["MODEL_TRAINING_CUTOFF_LEAKAGE"] };
      }
      const ports = new PostgresAgentPorts(sql, request.configVersion);
      const context = { jobId: "preflight", leaseToken: "preflight", signal: new AbortController().signal };
      const missing: string[] = [];
      try {
        const weather = await ports.fetchWeatherRun(request, context);
        versions.weatherRunIds = weather.runIds ?? [weather.id];
        if (weather.runs?.some(run => run.availabilityAssumption)) missing.push("UNVERIFIED_HISTORICAL_AVAILABILITY");
      } catch (error) {
        if (!(error instanceof StepError)) throw error;
        missing.push("NO_ELIGIBLE_WEATHER_RUN");
      }
      try {
        const observations = await ports.listObservations(request, context);
        versions.observationRevisions = observations.map(row => ({ observationId: row.id, revision: row.revision }));
        if (observations.some(row => row.dataUse === "evaluation_only" || row.eventTime >= "2026-02-01T00:00:00.000Z" ||
          !row.availableAt || row.availableAt > request.issuedAt || row.unit !== "normalized" || !Number.isFinite(row.value))) {
          missing.push("INELIGIBLE_OBSERVATIONS");
        }
      } catch (error) {
        if (!(error instanceof StepError)) throw error;
        missing.push("MISSING_OBSERVATIONS");
      }
      return { versions, missing };
    },
    async forecast(id, request) {
      return (await forecasts.list({ assetId: request.assetIds[0], issuedAt: request.issuedAt,
        mode: request.mode, horizonHours: request.horizonHours })).find(row => row.id === id) ?? null;
    },
  };
}
