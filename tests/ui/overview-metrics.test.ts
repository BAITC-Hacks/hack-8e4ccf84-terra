import assert from "node:assert/strict";
import test from "node:test";
import type { Forecast, Point } from "../../src/components/dashboard/contracts";
import {
  deriveOverviewMetrics,
  FORECAST_INTERVAL_HOURS,
  LARGE_CHANGE_THRESHOLD,
} from "../../src/components/dashboard/overview-metrics";

const hour = (target_time: string, prediction: number | null, lead_hour = 1): Point => ({
  target_time,
  lead_hour,
  prediction,
  actual: null,
  status: prediction == null ? "missing" : "ready",
});

function forecast(id: string, asset_id: string, issued_at: string, points: Point[]): Forecast {
  return {
    id,
    asset_id,
    issued_at,
    mode: "live",
    horizon_hours: 48,
    model_version: "test-model",
    weather_run_id: "weather-test",
    input_snapshot_id: "snapshot-test",
    unit: "normalized",
    stale: false,
    briefing: "test",
    points,
  };
}

test("overview metrics compare the same asset at matching target hours", () => {
  const metrics = deriveOverviewMetrics([
    forecast("other-newer", "asset-b", "2026-01-31T11:00:00Z", [
      hour("2026-02-01T01:00:00Z", 0.99),
    ]),
    forecast("asset-a-previous", "asset-a", "2026-01-31T10:00:00Z", [
      hour("2026-02-01T01:00:00Z", 0.39),
      hour("2026-02-01T02:00:00Z", 0.1, 2),
      hour("2026-02-01T04:00:00Z", 0.9, 4),
    ]),
    forecast("asset-a-latest", "asset-a", "2026-01-31T12:00:00Z", [
      hour("2026-02-01T01:00:00Z", 0.67),
      hour("2026-02-01T02:00:00Z", 0.25, 2),
      hour("2026-02-01T03:00:00Z", null, 3),
    ]),
  ], "live");

  assert.equal(metrics.latest?.id, "asset-a-latest");
  assert.equal(metrics.previous?.id, "asset-a-previous");
  assert.equal(metrics.largestChange?.before, 0.39);
  assert.equal(metrics.largestChange?.point.prediction, 0.67);
  assert.ok(Math.abs((metrics.largestChange?.difference ?? 0) - 0.28) < 1e-12);
  assert.equal(metrics.largeChanges, 2, "the existing ≥15 pp threshold remains inclusive");
  assert.equal(LARGE_CHANGE_THRESHOLD, 0.15);
  assert.equal(metrics.peak?.prediction, 0.67);
  assert.equal(metrics.low?.prediction, 0.25);
  assert.equal(metrics.normalizedIntegral, (0.67 + 0.25) * FORECAST_INTERVAL_HOURS);
});

test("missing predictions are excluded instead of being replaced with zero", () => {
  const metrics = deriveOverviewMetrics([
    forecast("missing", "asset-a", "2026-01-31T12:00:00Z", [
      hour("2026-02-01T01:00:00Z", null),
      hour("2026-02-01T02:00:00Z", null, 2),
    ]),
  ], "live");

  assert.equal(metrics.points.length, 0);
  assert.equal(metrics.peak, undefined);
  assert.equal(metrics.low, undefined);
  assert.equal(metrics.normalizedIntegral, null);
  assert.equal(metrics.largestChange, undefined);
});
