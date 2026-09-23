import assert from "node:assert/strict";
import test from "node:test";
import {evaluateForecasts} from "../../src/server/evaluation/evaluate";
import type {EvaluationPoint} from "../../src/server/evaluation/types";

function point(overrides: Partial<EvaluationPoint> = {}): EvaluationPoint {
  return {
    assetId: "station-1",
    issuedAt: "2026-01-31T23:00:00.000Z",
    targetTime: "2026-02-01T00:00:00.000Z",
    leadHour: 1,
    prediction: 8,
    baselinePrediction: 7,
    actual: 10,
    unit: "source_scale",
    forecastRunId: "forecast-1",
    ...overrides,
  };
}

test("calculates MAE/RMSE and baseline on identical pairs", () => {
  const report = evaluateForecasts({
    id: "evaluation-1",
    backtestJobId: "job-1",
    snapshotHash: "snapshot",
    createdAt: "2026-03-01T00:00:00.000Z",
    points: [
      point(),
      point({targetTime: "2026-02-02T00:00:00.000Z", prediction: 14, baselinePrediction: null, actual: 10}),
      point({assetId: "station-2", targetTime: "2026-02-03T00:00:00.000Z", leadHour: 25, prediction: 7, baselinePrediction: 13, actual: 10}),
    ],
  });

  const overall = report.metrics.find((slice) => slice.dimension === "overall");
  assert.deepEqual(overall?.model, {mae: 3, rmse: Math.sqrt(29 / 3), n: 3});
  assert.deepEqual(overall?.comparison?.model, {mae: 2.5, rmse: Math.sqrt(6.5), n: 2});
  assert.deepEqual(overall?.comparison?.baseline, {mae: 3, rmse: 3, n: 2});
  assert.equal(report.coverage, 1);
  assert.ok(report.metrics.some((slice) => slice.dimension === "asset_lead"
    && slice.assetId === "station-2" && slice.leadBucket === "lead_25_48"));
});

test("keeps March tails out of February metrics and reports missing actuals", () => {
  const report = evaluateForecasts({
    id: "evaluation-2",
    backtestJobId: "job-2",
    snapshotHash: "snapshot",
    points: [
      point({targetTime: "2026-02-28T23:00:00.000Z"}),
      point({targetTime: "2026-02-10T00:00:00.000Z", actual: null}),
      point({targetTime: "2026-03-01T00:00:00.000Z", leadHour: 48}),
    ],
  });

  assert.equal(report.eligiblePairCount, 2);
  assert.equal(report.evaluatedPairCount, 1);
  assert.equal(report.coverage, 0.5);
  assert.deepEqual(report.exclusions.map(({reason}) => reason).sort(), [
    "missing_actual",
    "outside_evaluation_period",
  ]);
});

test("represents N=0 with null metrics instead of a zero error", () => {
  const report = evaluateForecasts({
    id: "evaluation-3",
    backtestJobId: "job-3",
    snapshotHash: "snapshot",
    points: [point({actual: null})],
  });
  assert.equal(report.metrics[0].model, null);
  assert.equal(report.metrics[0].comparison, null);
});
