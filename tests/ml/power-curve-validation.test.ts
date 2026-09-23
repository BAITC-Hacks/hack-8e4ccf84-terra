import assert from "node:assert/strict";
import test from "node:test";
import {type TrainingExample} from "../../src/server/ml/features";
import {fitPowerCurve, predictPowerCurve} from "../../src/server/ml/power-curve";
import {validateCandidates} from "../../src/server/ml/validation";

function history(includeFebruaryOutlier = false): TrainingExample[] {
  const rows: TrainingExample[] = [];
  for (let month = 5; month <= 25; month += 1) {
    for (let day = 1; day <= 28; day += 1) {
      const timestamp = new Date(Date.UTC(2024, month, day, 0));
      const calendarMonth = timestamp.getUTCMonth();
      const windSpeed = 3 + ((day + calendarMonth) % 12) * 0.6;
      const temperature = -5 + calendarMonth * 2 + day / 10;
      const isFebruary = timestamp.getUTCFullYear() === 2026 && calendarMonth === 1;
      rows.push({
        timestamp: timestamp.toISOString(),
        windSpeed,
        temperature,
        assetId: "station",
        leadHours: day % 48,
        target: isFebruary && includeFebruaryOutlier
          ? 1_000_000
          : 0.02 * windSpeed ** 3 - 0.01 * temperature,
      });
    }
  }
  return rows;
}

test("empirical power curve interpolates between train-only bins", () => {
  const rows = history().slice(0, 100);
  const curve = fitPowerCurve(rows, 1);
  const prediction = predictPowerCurve(curve, 6.25);
  assert.ok(Number.isFinite(prediction));
  assert.ok(curve.points.every((point) => point.count > 0));
});

test("validation uses three pre-cutoff folds and ignores February actuals", () => {
  const options = {
    cutoff: "2026-02-01T00:00:00.000Z",
    historyWindows: [3, 6, 12, "full"] as const,
    ridgeLambdas: [0.1],
    ridgeMaxIterations: 400,
  };
  const normal = validateCandidates(history(false), options);
  const poisonedFebruary = validateCandidates(history(true), options);
  assert.equal(normal.selectedCandidateId, poisonedFebruary.selectedCandidateId);
  assert.deepEqual(normal.candidates, poisonedFebruary.candidates);
  assert.ok(normal.candidates.some((candidate) => candidate.eligible));
  for (const candidate of normal.candidates.filter((item) => item.eligible)) {
    assert.equal(candidate.folds.length, 3);
    assert.ok(candidate.folds.every((fold) => fold.validationEnd <= normal.cutoff));
  }
  const pairCounts = normal.candidates
    .filter((candidate) => candidate.eligible)
    .map((candidate) => candidate.aggregate!.count);
  assert.equal(new Set(pairCounts).size, 1);
});
