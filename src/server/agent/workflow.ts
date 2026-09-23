import { createHash } from "node:crypto";
import type { JobPayload } from "../jobs/types";
import type { AgentExecutionContext, AgentPorts, ForecastPoint, ObservationInput, WeatherInput } from "./ports";
import { AgentDecisionSchema, type AgentDecision } from "./schemas";

export const STEPS = [
  "fetch_weather_run", "validate_inputs", "select_strategy", "build_features", "predict",
  "compare_forecasts", "explain", "publish",
] as const;

type Checkpoint = Record<string, unknown>;

export class StepError extends Error {
  constructor(public readonly code: string, public readonly retryable = false) {
    super(code);
  }
}

const validTime = (time: string | null): number => time === null ? NaN : Date.parse(time);
const beforeOrAt = (time: string | null, issuedAt: string): boolean =>
  Number.isFinite(validTime(time)) && validTime(time) <= validTime(issuedAt);

function targetHours(issuedAt: string, horizon: number): Set<string> {
  const issued = validTime(issuedAt);
  if (!Number.isFinite(issued) || new Date(issued).toISOString() !== issuedAt) {
    throw new StepError("INVALID_ISSUED_AT");
  }
  return new Set(Array.from({ length: horizon }, (_, index) =>
    new Date(issued + (index + 1) * 3_600_000).toISOString()));
}

export function validateInputs(request: JobPayload, weather: WeatherInput, observations: ObservationInput[]): void {
  const expected = targetHours(request.issuedAt, request.horizonHours);
  if (request.weatherRunId && request.weatherRunId !== weather.id) throw new StepError("WEATHER_RUN_MISMATCH");
  if (!beforeOrAt(weather.availableAt, request.issuedAt) || !beforeOrAt(weather.publishedAt, request.issuedAt)) {
    throw new StepError("WEATHER_NOT_AVAILABLE_AT_ISSUE");
  }
  if (new Set(weather.targets).size !== weather.targets.length || weather.targets.length !== expected.size ||
      weather.targets.some((target) => !expected.has(target))) {
    throw new StepError("INCOMPLETE_WEATHER_HORIZON");
  }
  if (weather.assetIds && (new Set(weather.assetIds).size !== request.assetIds.length ||
      request.assetIds.some((assetId) => !weather.assetIds!.includes(assetId)))) {
    throw new StepError("WEATHER_ASSET_MISMATCH");
  }
  if (weather.coverage !== undefined && weather.coverage !== 1) throw new StepError("INSUFFICIENT_WEATHER_COVERAGE");
  if (weather.checksum !== undefined && !/^[0-9a-f]{64}$/.test(weather.checksum)) throw new StepError("INVALID_WEATHER_CHECKSUM");
  if (weather.values) {
    for (const assetId of request.assetIds) for (const target of expected) {
      const values = weather.values.filter((value) => value.assetId === assetId && value.targetTime === target &&
        value.metric === "wind_speed" && value.unit === "m/s" && Number.isFinite(value.value) &&
        value.qualityFlag !== "rejected");
      if (values.length !== 1) throw new StepError("INVALID_WEATHER_VALUES");
    }
  }
  for (const observation of observations) {
    if (!beforeOrAt(observation.availableAt, request.issuedAt) ||
      !beforeOrAt(observation.eventTime, request.issuedAt)) throw new StepError("OBSERVATION_NOT_AVAILABLE_AT_ISSUE");
    if (!Number.isFinite(observation.value) || !Number.isInteger(observation.revision) || observation.revision < 1)
      throw new StepError("INVALID_OBSERVATION");
    if (observation.assetId !== undefined && !request.assetIds.includes(observation.assetId))
      throw new StepError("OBSERVATION_ASSET_MISMATCH");
    if (observation.metric !== undefined && observation.metric !== "normalized_power")
      throw new StepError("OBSERVATION_METRIC_MISMATCH");
    if (observation.unit !== undefined && observation.unit !== "normalized")
      throw new StepError("UNKNOWN_OBSERVATION_UNIT");
    if (observation.qualityFlag === "rejected") throw new StepError("OBSERVATION_QUALITY_REJECTED");
    if (observation.dataUse === "evaluation_only") throw new StepError("EVALUATION_DATA_FORBIDDEN");
  }
}

function validatePrediction(request: JobPayload, points: ForecastPoint[]): void {
  const targets = targetHours(request.issuedAt, request.horizonHours);
  const assets = new Set(request.assetIds);
  const keys = new Set<string>();
  if (points.length !== assets.size * targets.size || assets.size !== request.assetIds.length) {
    throw new StepError("INCOMPLETE_FORECAST");
  }
  for (const point of points) {
    const key = `${point.assetId}|${point.targetTime}`;
    if (point.unit !== "normalized") throw new StepError("UNKNOWN_FORECAST_UNIT");
    if (!assets.has(point.assetId) || !targets.has(point.targetTime) || !Number.isFinite(point.value) || keys.has(key)) {
      throw new StepError("INVALID_FORECAST_POINT");
    }
    keys.add(key);
  }
}

function templateExplanation(request: JobPayload, weather: WeatherInput, comparison: Record<string, unknown>): string {
  const delta = typeof comparison.meanDelta === "number" && Number.isFinite(comparison.meanDelta)
    ? ` Изменение на общих часах: ${comparison.meanDelta.toFixed(4)}.` : " Сравнение с предыдущей версией недоступно.";
  return `Прогноз для ${request.assetIds.join(", ")} на ${request.horizonHours} ч от ${request.issuedAt} UTC. ` +
    `Погодный прогон ${weather.id}.${delta} Объяснение сформировано по шаблону; причинное влияние признаков не установлено.`;
}

export function publicationKey(request: JobPayload, weather: WeatherInput, observations: ObservationInput[],
  snapshotHash?: string): string {
  const canonical = {
    assetIds: [...request.assetIds].sort(), issuedAt: request.issuedAt, horizonHours: request.horizonHours,
    mode: request.mode, modelVersionId: request.modelVersionId,
    configVersion: request.configVersion, dataPolicy: request.dataPolicy, weatherRunId: weather.id,
    snapshotHash: snapshotHash ?? null,
    observationRevisions: observations.map((item) => [item.id, item.revision]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export interface StepOutcome {
  checkpoint: Checkpoint;
  resultId?: string;
  reason: string;
  fallback?: boolean;
}

function validateDecision(decision: unknown, allowed: AgentDecision["action"][], weather: WeatherInput): AgentDecision {
  const parsed = AgentDecisionSchema.parse(decision);
  if (!allowed.includes(parsed.action)) throw new StepError("INVALID_AGENT_ACTION");
  if (["use_primary", "use_cached_weather"].includes(parsed.action) && parsed.candidateId !== weather.id) {
    throw new StepError("INVALID_AGENT_CANDIDATE");
  }
  if (parsed.evidenceRefs.some((ref) => ![weather.id, ...(weather.runIds ?? [])].includes(ref))) {
    throw new StepError("INVALID_AGENT_EVIDENCE");
  }
  return parsed;
}

/** Executes exactly one resumable step. Every external result is checked before publication. */
export async function executeStep(ports: AgentPorts, request: JobPayload, step: number, checkpoint: Checkpoint,
  context: AgentExecutionContext): Promise<StepOutcome> {
  context.signal.throwIfAborted();
  const next = structuredClone(checkpoint);
  const weather = next.weather as WeatherInput | undefined;
  const observations = next.observations as ObservationInput[] | undefined;
  const points = next.points as ForecastPoint[] | undefined;
  const comparison = next.comparison as Record<string, unknown> | undefined;
  switch (STEPS[step]) {
    case "fetch_weather_run":
      next.weather = await ports.fetchWeatherRun(request, context);
      next.observations = await ports.listObservations(request, context);
      return { checkpoint: next, reason: "Погодный прогон и измерения получены" };
    case "validate_inputs":
      if (!weather || !observations) throw new StepError("MISSING_INPUTS");
      validateInputs(request, weather, observations);
      return { checkpoint: next, reason: "Время доступности и полный горизонт проверены кодом" };
    case "select_strategy": {
      if (!weather || !observations) throw new StepError("MISSING_INPUTS");
      const fallback: AgentDecision = { action: "use_primary", candidateId: weather.id,
        reasonCode: "DETERMINISTIC_FALLBACK", reasonSummary: "Входы прошли обязательные проверки.",
        evidenceRefs: [weather.id], limitations: ["LLM decision disabled or unavailable"], retryAfterSeconds: null };
      let decision = fallback;
      let usedFallback = true;
      if (ports.decide) {
        try {
          decision = validateDecision(await ports.decide({ request, weather, observations,
            allowedActions: ["use_primary", "stop"] }, context), ["use_primary", "stop"], weather);
          usedFallback = false;
        } catch (error) {
          if (error instanceof StepError) throw error;
        }
      }
      if (decision.action === "stop") throw new StepError(decision.reasonCode);
      next.decision = decision;
      return { checkpoint: next, reason: decision.reasonSummary, fallback: usedFallback };
    }
    case "build_features":
      if (!weather || !observations) throw new StepError("MISSING_INPUTS");
      next.features = await ports.buildFeatures({ request, weather, observations }, context);
      return { checkpoint: next, reason: "Признаки построены" };
    case "predict":
      if (!next.features) throw new StepError("MISSING_FEATURES");
      next.points = await ports.predict({ request, features: next.features as Record<string, unknown> }, context);
      validatePrediction(request, next.points as ForecastPoint[]);
      return { checkpoint: next, reason: "Почасовые точки проверены кодом" };
    case "compare_forecasts":
      if (!points) throw new StepError("MISSING_FORECAST");
      next.comparison = await ports.compareForecasts({ request, points }, context);
      return { checkpoint: next, reason: "Версии сравнены на общих часах" };
    case "explain": {
      if (!weather || !points || !comparison) throw new StepError("MISSING_EXPLANATION_INPUTS");
      try {
        if (!ports.explain) throw new Error("LLM_UNAVAILABLE");
        next.explanation = await ports.explain({ request, comparison, points }, context);
        if (typeof next.explanation !== "string" || !next.explanation) throw new Error("EMPTY_EXPLANATION");
        return { checkpoint: next, reason: "Объяснение получено" };
      } catch {
        next.explanation = templateExplanation(request, weather, comparison);
        return { checkpoint: next, reason: "LLM недоступен; применён проверяемый шаблон", fallback: true };
      }
    }
    case "publish": {
      if (!weather || !observations || !points || !comparison || typeof next.explanation !== "string") {
        throw new StepError("MISSING_PUBLICATION_INPUTS");
      }
      // Revalidate persisted checkpoint after a restart or external adapter change.
      validateInputs(request, weather, observations);
      validatePrediction(request, points);
      const snapshotHash = (next.features as { snapshot?: { sha256?: string } } | undefined)?.snapshot?.sha256;
      const published = await ports.publish({ request,
        publicationKey: publicationKey(request, weather, observations, snapshotHash), snapshotHash,
        weatherRun: weather, observations, points, comparison,
        evaluation: (next.evaluation as Record<string, unknown> | null) ?? null, explanation: next.explanation }, context);
      next.resultId = published.id;
      return { checkpoint: next, resultId: published.id, reason: `Опубликована версия ${published.version}` };
    }
    default:
      throw new StepError("INVALID_STEP");
  }
}
