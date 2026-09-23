import type {SemanticManifest} from "../../src/server/evaluation/semantics";
import type {EvaluationPoint} from "../../src/server/evaluation/types";
export const assetId = "10000000-0000-4000-8000-000000000001";
export function manifest(timezone = "UTC"): SemanticManifest {
  return {version: 1,
    timezone: {status: "confirmed", value: timezone, source: "synthetic test fixture"},
    intervalMeaning: {status: "confirmed", value: "hour_start_mean", source: "synthetic test fixture"},
    availabilityLagMinutes: {status: "confirmed", value: 10, source: "synthetic test fixture"},
    mapping: {status: "confirmed", value: [{sourceSeries: "fixture", assetId}], source: "synthetic test fixture"},
    coordinates: {status: "UNKNOWN", value: null, source: "not needed for metric calculation"},
    unit: {status: "confirmed", value: "normalized", source: "synthetic test fixture"},
    normalization: {status: "confirmed", value: "synthetic source scale", source: "synthetic test fixture"}};
}
export function point(overrides: Partial<EvaluationPoint> = {}): EvaluationPoint {
  return {assetId, issuedAt: "2026-01-31T23:00:00.000Z", targetTime: "2026-02-01T00:00:00.000Z",
    leadHour: 1, prediction: 0.2, baselinePrediction: 0.1, actual: 0.4, unit: "normalized",
    forecastRunId: "fixture-run", ...overrides};
}
