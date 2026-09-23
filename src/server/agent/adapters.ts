import { createHash } from "node:crypto";
import type postgres from "postgres";
import type { ForecastRequest, Observation, WeatherRun, WeatherValue } from "../contracts";
import { targetHours, type ForecastInputSnapshot } from "../data/snapshot/build";
import { PostgresForecastStore } from "../forecast/postgres-store";
import { assertApprovedModel, baselineInference, type ForecastInference } from "../forecast/inference";
import { loadForecastModel } from "../forecast/runtime";
import type { JobPayload } from "../jobs/types";
import { StepError } from "./workflow";
import type { AgentExecutionContext, AgentPorts, ForecastPoint, ObservationInput, WeatherInput } from "./ports";
import {pinnedSnapshot, pinnedWeather, type TriggerSnapshotReader} from "./pinned-inputs";

type Sql = ReturnType<typeof postgres>;
const iso = (value: Date | string) => new Date(value).toISOString();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const requestOf = (request: JobPayload): ForecastRequest => ({ assetIds: request.assetIds,
  issuedAt: request.issuedAt, horizonHours: request.horizonHours, mode: request.mode,
  modelVersionId: request.modelVersionId, dataPolicy: request.dataPolicy });

/** Production adapters over the canonical S01/S04 PostgreSQL stores. */
export class PostgresAgentPorts implements AgentPorts {
  private readonly forecasts: PostgresForecastStore;
  constructor(private readonly sql: Sql, private readonly configVersion: string,
    private readonly decision?: AgentPorts["decide"], private readonly explainer?: AgentPorts["explain"],
    private readonly inference: ForecastInference = baselineInference,
    private readonly triggerSnapshots?: TriggerSnapshotReader) {
    this.forecasts = new PostgresForecastStore(sql);
  }

  private async approvedModel(request: ForecastRequest) {
    try {
      const model = await loadForecastModel(this.sql, request.modelVersionId);
      assertApprovedModel(request, model);
      return model;
    } catch (error) {
      if (error instanceof Error && error.message === "MODEL_NOT_APPROVED") throw new StepError("MODEL_NOT_APPROVED");
      throw error;
    }
  }

  async fetchWeatherRun(request: JobPayload, context: AgentExecutionContext): Promise<WeatherInput> {
    context.signal.throwIfAborted();
    const pinned = await pinnedSnapshot(request, this.triggerSnapshots);
    if (pinned) return pinnedWeather(pinned, request);
    const targets = targetHours(request.issuedAt, request.horizonHours);
    const selectedRuns: WeatherRun[] = [];
    const selectedValues: Array<NonNullable<WeatherInput["values"]>[number]> = [];
    const checksums: string[] = [];
    for (const assetId of request.assetIds) {
      const rows = await this.sql`
        SELECT w.*, a.sha256 FROM weather_runs w JOIN raw_artifacts a ON a.id = w.raw_artifact_id
        WHERE w.asset_id = ${assetId} AND w.available_at IS NOT NULL AND w.available_at <= ${request.issuedAt}
          AND w.published_at IS NOT NULL AND w.published_at <= ${request.issuedAt}
          AND (w.run_time IS NULL OR w.run_time <= ${request.issuedAt})
          AND (${request.weatherRunId ?? null}::uuid IS NULL OR w.id = ${request.weatherRunId ?? null}::uuid)
        ORDER BY w.available_at DESC, w.id DESC`;
      let picked = false;
      for (const row of rows) {
        const values = await this.sql`SELECT run_id, target_time, metric, value, unit, height_metres
          FROM weather_values WHERE run_id = ${row.id}
            AND target_time >= ${targets[0]} AND target_time <= ${targets.at(-1)!}
          ORDER BY target_time`;
        const wind = values.filter((value) => value.metric === "wind_speed" && value.unit === "m/s" &&
          Number.isFinite(Number(value.value)));
        const byTarget = new Map(wind.map((value) => [iso(value.target_time), value]));
        if (!targets.every((target) => byTarget.has(target))) continue;
        selectedRuns.push({ id: row.id, assetId: row.asset_id, provider: row.provider, model: row.model,
          runTime: row.run_time ? iso(row.run_time) : null, publishedAt: iso(row.published_at),
          availableAt: iso(row.available_at), fetchedAt: iso(row.fetched_at), rawArtifactId: row.raw_artifact_id,
          availabilityAssumption: row.availability_assumption });
        selectedValues.push(...values.map((value) => ({
          runId: row.id, assetId, targetTime: iso(value.target_time), metric: value.metric, value: Number(value.value),
          unit: value.unit as string | null, heightMetres: value.height_metres == null ? null : Number(value.height_metres),
          qualityFlag: "accepted" })));
        checksums.push(row.sha256);
        picked = true;
        break;
      }
      if (!picked) throw new StepError("NO_ELIGIBLE_WEATHER_RUN", true);
    }
    const runIds = selectedRuns.map((run) => run.id);
    return { id: runIds.length === 1 ? runIds[0] : hash(runIds), runIds,
      assetIds: [...request.assetIds], availableAt: selectedRuns.map((run) => run.availableAt!).sort().at(-1)!,
      publishedAt: selectedRuns.map((run) => run.publishedAt!).sort().at(-1)!, targets,
      source: [...new Set(selectedRuns.map((run) => run.provider))].join(","), checksum: hash(checksums),
      coverage: 1, values: selectedValues, runs: selectedRuns };
  }

  async listObservations(request: JobPayload, context: AgentExecutionContext): Promise<ObservationInput[]> {
    context.signal.throwIfAborted();
    const pinned = await pinnedSnapshot(request, this.triggerSnapshots);
    if (pinned) return pinned.observations.map(row => ({...row, dataUse: "features"}));
    const rows = await this.sql`SELECT DISTINCT ON (asset_id) id, asset_id, metric, value, unit,
      event_time, available_at, ingested_at, revision, quality_flag, source_time_zone,
      availability_assumption, raw_artifact_id FROM observations
      WHERE asset_id = ANY(${this.sql.array(request.assetIds, 2950)}) AND metric = 'normalized_power'
        AND event_time <= ${request.issuedAt} AND available_at IS NOT NULL AND available_at <= ${request.issuedAt}
        AND quality_flag = 'accepted'
        AND NOT (${request.mode === "backtest"} AND event_time >= '2026-02-01T00:00:00.000Z')
      ORDER BY asset_id, event_time DESC, revision DESC`;
    if (rows.length !== request.assetIds.length) throw new StepError("MISSING_OBSERVATIONS");
    return rows.map((row) => ({ id: row.id, assetId: row.asset_id, metric: row.metric,
      value: Number(row.value), unit: row.unit, eventTime: iso(row.event_time), availableAt: iso(row.available_at),
      revision: Number(row.revision), qualityFlag: row.quality_flag, dataUse: "features" }));
  }

  decide(input: Parameters<NonNullable<AgentPorts["decide"]>>[0], context: AgentExecutionContext) {
    if (!this.decision) return Promise.reject(new Error("LLM_DISABLED"));
    return this.decision(input, context);
  }

  async buildFeatures(input: { request: JobPayload; weather: WeatherInput; observations: ObservationInput[] },
    context: AgentExecutionContext): Promise<Record<string, unknown>> {
    context.signal.throwIfAborted();
    await this.approvedModel(requestOf(input.request));
    const pinned = await pinnedSnapshot(input.request, this.triggerSnapshots);
    if (pinned) return {snapshot: pinned};
    const observations: Observation[] = input.observations.map((row) => ({ id: row.id,
      assetId: row.assetId!, metric: row.metric!, value: row.value, unit: row.unit ?? null,
      eventTime: row.eventTime, availableAt: row.availableAt, ingestedAt: row.availableAt!, revision: row.revision,
      qualityFlag: row.qualityFlag ?? "accepted", sourceTimeZone: null, availabilityAssumption: null,
      rawArtifactId: null }));
    const weatherValues: WeatherValue[] = (input.weather.values ?? []).map((row) => ({ runId: row.runId!,
      targetTime: row.targetTime, metric: row.metric, value: row.value, unit: row.unit, heightMetres: row.heightMetres ?? null }));
    const content = { issuedAt: input.request.issuedAt, assetIds: [...input.request.assetIds].sort(),
      observationRevisions: observations.map((row) => ({ observationId: row.id, revision: row.revision })),
      weatherRunIds: input.weather.runIds ?? [input.weather.id], observations,
      weatherRuns: input.weather.runs ?? [], weatherValues, configVersion: input.request.configVersion ?? this.configVersion,
      missing: [] as string[] };
    const sha256 = hash(content);
    const snapshot: ForecastInputSnapshot = { id: sha256, ...content, payload: content,
      sha256, createdAt: new Date().toISOString() };
    return { snapshot };
  }

  async predict(input: { request: JobPayload; features: Record<string, unknown> },
    context: AgentExecutionContext): Promise<ForecastPoint[]> {
    context.signal.throwIfAborted();
    const snapshot = input.features.snapshot as ForecastInputSnapshot | undefined;
    if (!snapshot) throw new StepError("MISSING_SNAPSHOT");
    const request = requestOf(input.request);
    const model = await this.approvedModel(request);
    let values;
    try {
      values = await this.inference(request, snapshot, model);
    } catch (error) {
      if (error instanceof Error && error.message === "MODEL_INFERENCE_NOT_IMPLEMENTED")
        throw new StepError("MODEL_INFERENCE_NOT_IMPLEMENTED");
      throw error;
    }
    context.signal.throwIfAborted();
    return values;
  }

  async compareForecasts(input: { request: JobPayload; points: ForecastPoint[] },
    context: AgentExecutionContext): Promise<Record<string, unknown>> {
    context.signal.throwIfAborted();
    const previous = (await this.forecasts.list({ issuedAt: input.request.issuedAt, mode: input.request.mode,
      horizonHours: input.request.horizonHours })).find((row) =>
        input.request.assetIds.every((assetId) => row.request.assetIds.includes(assetId)));
    if (!previous) return { previousForecastId: null, commonHours: 0, meanDelta: null, meanAbsoluteDelta: null };
    const old = new Map(previous.values.map((point) => [`${point.assetId}|${point.targetTime}`, point.value]));
    const deltas = input.points.flatMap((point) => { const before = old.get(`${point.assetId}|${point.targetTime}`);
      return before === undefined ? [] : [point.value - before]; });
    return { previousForecastId: previous.id, commonHours: deltas.length,
      meanDelta: deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : null,
      meanAbsoluteDelta: deltas.length ? deltas.reduce((sum, value) => sum + Math.abs(value), 0) / deltas.length : null };
  }

  async evaluateWhenActualsArrive(): Promise<null> { return null; }

  explain(input: Parameters<NonNullable<AgentPorts["explain"]>>[0], context: AgentExecutionContext) {
    if (!this.explainer) return Promise.reject(new Error("LLM_DISABLED"));
    return this.explainer(input, context);
  }

  async publish(input: Parameters<AgentPorts["publish"]>[0], context: AgentExecutionContext) {
    context.signal.throwIfAborted();
    // The snapshot is persisted in the predict checkpoint, so rebuild the same immutable content here.
    const observations: Observation[] = input.observations.map((row) => ({ id: row.id, assetId: row.assetId!,
      metric: row.metric!, value: row.value, unit: row.unit ?? null, eventTime: row.eventTime,
      availableAt: row.availableAt, ingestedAt: row.availableAt!, revision: row.revision,
      qualityFlag: row.qualityFlag ?? "accepted", sourceTimeZone: null, availabilityAssumption: null, rawArtifactId: null }));
    const weatherValues: WeatherValue[] = (input.weatherRun.values ?? []).map((row) => ({ runId: row.runId!,
      targetTime: row.targetTime, metric: row.metric, value: row.value, unit: row.unit, heightMetres: row.heightMetres ?? null }));
    const content = { issuedAt: input.request.issuedAt, assetIds: [...input.request.assetIds].sort(),
      observationRevisions: observations.map((row) => ({ observationId: row.id, revision: row.revision })),
      weatherRunIds: input.weatherRun.runIds ?? [input.weatherRun.id], observations,
      weatherRuns: input.weatherRun.runs ?? [], weatherValues, configVersion: input.request.configVersion ?? this.configVersion,
      missing: [] as string[], agent: { briefing: input.explanation, comparison: input.comparison } };
    const sha256 = hash(content);
    const forecast = await this.forecasts.publish({ request: requestOf(input.request),
      snapshot: { id: sha256, ...content, payload: content, sha256, createdAt: new Date().toISOString() },
      inputSnapshotId: sha256, status: "published", idempotencyKey: input.publicationKey,
      createdAt: new Date().toISOString(), publishedAt: new Date().toISOString(),
      values: input.points.map((point) => ({ ...point, qualityFlag: point.qualityFlag ?? null })),
      incompleteReasons: [] }, { jobId: context.jobId, leaseToken: context.leaseToken,
      now: new Date().toISOString() });
    return { id: forecast.id, version: forecast.version, points: input.points,
      weatherRunId: input.weatherRun.id, mode: input.request.mode };
  }
}
