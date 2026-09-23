import assert from "node:assert/strict";
import test from "node:test";
import {assertReproducible} from "../../src/server/backtest/reproducibility";
import type {ForecastBatch, ForecastPoint} from "../../src/server/backtest/types";
import {exportForecastCsv, FORECAST_CSV_COLUMNS} from "../../src/server/export/forecast-csv";

function point(prediction = 0.42): ForecastPoint {
  return {
    assetId: "station,one",
    issuedAt: "2026-01-31T23:00:00.000Z",
    targetTime: "2026-02-01T00:00:00.000Z",
    leadHour: 1,
    prediction,
    baselinePrediction: 0.4,
    unit: "source_scale",
    modelVersion: "ridge-v1",
    weatherRunId: "weather-1",
    forecastRunId: "forecast-1",
    status: "published",
    snapshotHash: "snapshot-1",
  };
}

function batches(prediction = 0.42): ForecastBatch[] {
  return [{
    forecastRunId: "forecast-1",
    issuedAt: "2026-01-31T23:00:00.000Z",
    snapshot: {hash: "snapshot-1", availableAt: ["2026-01-31T23:00:00.000Z"]},
    points: [point(prediction)],
  }];
}

test("accepts deterministic reruns within 1e-6 and rejects larger drift", () => {
  assert.doesNotThrow(() => assertReproducible(batches(), batches(0.4200009)));
  assert.throws(() => assertReproducible(batches(), batches(0.4200011)), /beyond tolerance/);
});

test("exports exactly the FR-10 columns with RFC 4180 escaping", () => {
  const csv = exportForecastCsv([point()]);
  assert.equal(csv.split("\r\n")[0], FORECAST_CSV_COLUMNS.join(","));
  assert.match(csv, /^asset_id,issued_at,target_time,lead_hour,prediction,unit,model_version,weather_run_id,forecast_run_id,status\r\n/);
  assert.match(csv, /"station,one"/);
  assert.ok(!csv.includes("baselinePrediction"));
});
