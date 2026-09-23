import type {Observation} from "../contracts";
import type {EvaluationPoint} from "./types";
import {evaluateForecasts} from "./evaluate";

/** Preserve the shared report contract, including empty slices for requested turbines. */
export function evaluatePublishedPoints(input: Parameters<typeof evaluateForecasts>[0]) {
  const points = uniquePublishedPoints(input.points);
  const report = evaluateForecasts({...input, points});
  const assets = [...new Set(points.filter((p) => Date.parse(p.targetTime) >= Date.parse(report.evaluationStart) &&
    Date.parse(p.targetTime) < Date.parse(report.evaluationEndExclusive)).map((p) => p.assetId))].sort();
  for (const assetId of assets) {
    if (report.metrics.some((s) => s.dimension === "asset" && s.assetId === assetId)) continue;
    report.metrics.push({dimension: "asset", assetId, leadBucket: null, model: null, comparison: null});
    for (const leadBucket of ["lead_1_24", "lead_25_48"] as const) {
      report.metrics.push({dimension: "asset_lead", assetId, leadBucket, model: null, comparison: null});
    }
  }
  for (const slice of report.metrics) {
    for (const value of [slice.model, slice.comparison?.model, slice.comparison?.baseline]) {
      if (value && (!Number.isFinite(value.mae) || !Number.isFinite(value.rmse))) throw new Error("NON_FINITE_EVALUATION_METRIC");
    }
  }
  return report;
}

/** Baseline uses only frozen, pre-February history already in the publication snapshot. */
export function snapshotBaseline(observations: Observation[], assetId: string, issuedAt: string, cutoff: string): number | null {
  const allowed = observations.filter((row) => row.assetId === assetId && row.metric === "normalized_power" &&
    row.unit === "normalized" && row.qualityFlag === "accepted" && Number.isFinite(row.value) &&
    Number.isFinite(Date.parse(row.eventTime)) && Date.parse(row.eventTime) < Date.parse(cutoff) &&
    Date.parse(row.eventTime) <= Date.parse(issuedAt) && row.availableAt !== null &&
    Number.isFinite(Date.parse(row.availableAt)) && Date.parse(row.availableAt) <= Date.parse(issuedAt));
  allowed.sort((a, b) => Date.parse(b.eventTime) - Date.parse(a.eventTime) || b.revision - a.revision || a.id.localeCompare(b.id));
  return allowed[0]?.value ?? null;
}

/** Distinct issues/leads are intentional samples; repeated rows of the same run are not. */
export function uniquePublishedPoints(points: EvaluationPoint[]): EvaluationPoint[] {
  const unique = new Map<string, EvaluationPoint>();
  for (const point of points) {
    const issue = Date.parse(point.issuedAt), target = Date.parse(point.targetTime);
    if (point.unit !== "normalized" || !Number.isFinite(point.prediction) || !Number.isInteger(point.leadHour) ||
      point.leadHour < 1 || point.leadHour > 48 || !Number.isFinite(issue) ||
      target !== issue + point.leadHour * 3_600_000) throw new Error("INVALID_PUBLISHED_POINT");
    const key = `${point.forecastRunId}/${point.assetId}/${new Date(target).toISOString()}`;
    const previous = unique.get(key);
    if (previous && (previous.prediction !== point.prediction || previous.actual !== point.actual ||
      previous.baselinePrediction !== point.baselinePrediction || previous.issuedAt !== point.issuedAt)) {
      throw new Error("CONFLICTING_FORECAST_DUPLICATE");
    }
    unique.set(key, point);
  }
  return [...unique.values()].sort((a, b) => a.forecastRunId.localeCompare(b.forecastRunId) ||
    a.assetId.localeCompare(b.assetId) || a.targetTime.localeCompare(b.targetTime));
}
