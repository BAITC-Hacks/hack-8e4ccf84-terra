import assert from "node:assert/strict";
import test from "node:test";
import {LeakageError} from "../../src/server/backtest/leakage";
import {BacktestRunner} from "../../src/server/backtest/runner";
import type {
  ActualsReader,
  BacktestForecastService,
  ForecastBatch,
  ForecastRequest,
  SnapshotReference,
} from "../../src/server/backtest/types";

const request = {
  assetIds: ["station-1"],
  issueTimes: ["2026-01-31T23:00:00.000Z", "2026-02-01T23:00:00.000Z"],
  horizonHours: 48 as const,
  modelVersion: "model-1",
  trainingCutoff: "2026-01-31T00:00:00.000Z",
};

function batch(input: ForecastRequest, snapshot: SnapshotReference): ForecastBatch {
  return {
    forecastRunId: `run-${input.issuedAt}`,
    issuedAt: input.issuedAt,
    snapshot,
    points: Array.from({length: input.horizonHours}, (_, index) => ({
      assetId: "station-1",
      issuedAt: input.issuedAt,
      targetTime: new Date(Date.parse(input.issuedAt) + (index + 1) * 3_600_000).toISOString(),
      leadHour: index + 1,
      prediction: 0.4,
      baselinePrediction: 0.5,
      unit: "source_scale",
      forecastRunId: `run-${input.issuedAt}`,
      status: "published",
      modelVersion: input.modelVersion,
      weatherRunId: "weather-1",
      snapshotHash: snapshot.hash,
    })),
  };
}

test("uses the production forecast boundary sequentially and reveals actuals only afterward", async () => {
  const calls: string[] = [];
  let currentSnapshot: SnapshotReference | null = null;
  const service: BacktestForecastService = {
    async createSnapshot(input) {
      calls.push(`snapshot:${input.issuedAt}`);
      currentSnapshot = {hash: `hash-${input.issuedAt}`, availableAt: [input.issuedAt]};
      return currentSnapshot;
    },
    async forecast(input) {
      calls.push(`forecast:${input.issuedAt}`);
      assert.equal(input.dataPolicy, "history_only");
      assert.equal(input.mode, "backtest");
      return batch(input, currentSnapshot as SnapshotReference);
    },
  };
  const actuals: ActualsReader = {
    async readActuals() {
      calls.push("actuals");
      return [{assetId: "station-1", targetTime: "2026-02-01T00:00:00.000Z", value: 0.6}];
    },
  };
  const result = await new BacktestRunner(service, actuals).run(request, "job-1");

  assert.deepEqual(calls, [
    "snapshot:2026-01-31T23:00:00.000Z",
    "forecast:2026-01-31T23:00:00.000Z",
    "snapshot:2026-02-01T23:00:00.000Z",
    "forecast:2026-02-01T23:00:00.000Z",
    "actuals",
  ]);
  assert.equal(result.evaluation.metrics[0].model?.n, 1);
});

test("rejects a forecast that relabels a past target as a later release", async () => {
  const service: BacktestForecastService = {
    async createSnapshot(input) { return {hash: "snapshot", availableAt: [input.issuedAt]}; },
    async forecast(input) {
      const result = batch(input, {hash: "snapshot", availableAt: [input.issuedAt]});
      result.points[0].targetTime = input.issuedAt;
      return result;
    },
  };
  const actuals: ActualsReader = {async readActuals() { return []; }};
  await assert.rejects(
    () => new BacktestRunner(service, actuals).run({...request, issueTimes: [request.issueTimes[0]]}),
    LeakageError,
  );
});

test("rejects a snapshot containing information published after release", async () => {
  const service: BacktestForecastService = {
    async createSnapshot(input) {
      return {hash: "future", availableAt: [new Date(Date.parse(input.issuedAt) + 1).toISOString()]};
    },
    async forecast() {
      throw new Error("must not forecast a leaking snapshot");
    },
  };
  const actuals: ActualsReader = {async readActuals() { return []; }};
  await assert.rejects(
    () => new BacktestRunner(service, actuals).run({...request, issueTimes: [request.issueTimes[0]]}),
    LeakageError,
  );
});

test("rejects training cutoff after January 2026", async () => {
  const service: BacktestForecastService = {
    async createSnapshot(input) { return {hash: "snapshot", availableAt: [input.issuedAt]}; },
    async forecast(input) { return batch(input, {hash: "snapshot", availableAt: [input.issuedAt]}); },
  };
  const actuals: ActualsReader = {async readActuals() { return []; }};
  await assert.rejects(
    () => new BacktestRunner(service, actuals).run({
      ...request,
      issueTimes: [request.issueTimes[1]],
      trainingCutoff: "2026-02-01T00:00:00.000Z",
    }),
    LeakageError,
  );
});
