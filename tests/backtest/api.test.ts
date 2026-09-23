import assert from "node:assert/strict";
import test from "node:test";
import {POST} from "../../src/app/api/v1/backtest-jobs/route";
import {GET as getEvaluation} from "../../src/app/api/v1/evaluations/[id]/route";
import {GET as exportForecast} from "../../src/app/api/v1/forecasts/[id]/export/route";
import {backtestRegistry} from "../../src/server/backtest/registry";
import type {EvaluationReport} from "../../src/server/evaluation/types";

const body = {
  asset_ids: ["station-1"],
  issue_times: ["2026-01-31T23:00:00.000Z"],
  horizon_hours: 48,
  model_version: "ridge-v1",
  training_cutoff: "2026-01-31T00:00:00.000Z",
};

function request(payload = body, key = "same-key") {
  return new Request("http://localhost/api/v1/backtest-jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      "Authorization": "Bearer test-token",
    },
    body: JSON.stringify(payload),
  });
}

test.beforeEach(() => {
  process.env.ADMIN_API_TOKEN = "test-token";
  backtestRegistry.clear();
});

test("POST queues a job and safely reuses an idempotent request", async () => {
  const first = await POST(request());
  const second = await POST(request());
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.equal(firstBody.job_id, secondBody.job_id);
  assert.equal(firstBody.reused, false);
  assert.equal(secondBody.reused, true);
});

test("POST rejects reuse of the same key with a different body", async () => {
  await POST(request());
  const response = await POST(request({...body, model_version: "ridge-v2"}));
  assert.equal(response.status, 409);
  const responseBody = await response.json();
  assert.equal(responseBody.error.code, "idempotency_conflict");
  assert.ok(responseBody.error.request_id);
});

test("POST rejects an invalid or unordered historical schedule before queueing", async () => {
  const response = await POST(request({...body, issue_times: [
    "2026-02-01T00:00:00.000Z",
    "2026-01-31T23:00:00.000Z",
  ]}));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_request");
});

test("protected APIs reject requests without the configured administrator token", async () => {
  const response = await POST(new Request("http://localhost/api/v1/backtest-jobs", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "unauthorized");
});

test("GET evaluation and forecast export return registered results", async () => {
  const report: EvaluationReport = {
    id: "evaluation-1",
    backtestJobId: "job-1",
    snapshotHash: "snapshot",
    evaluationStart: "2026-02-01T00:00:00.000Z",
    evaluationEndExclusive: "2026-03-01T00:00:00.000Z",
    eligiblePairCount: 0,
    evaluatedPairCount: 0,
    coverage: 0,
    metrics: [],
    exclusions: [],
    createdAt: "2026-03-01T00:00:00.000Z",
  };
  backtestRegistry.registerEvaluation(report);
  backtestRegistry.registerForecast("forecast-1", [{
    assetId: "station-1",
    issuedAt: "2026-01-31T23:00:00.000Z",
    targetTime: "2026-02-01T00:00:00.000Z",
    leadHour: 1,
    prediction: 0.42,
    unit: "source_scale",
    modelVersion: "ridge-v1",
    weatherRunId: "weather-1",
    forecastRunId: "forecast-1",
    status: "published",
    snapshotHash: "snapshot",
  }]);
  const headers = {Authorization: "Bearer test-token"};
  const evaluation = await getEvaluation(
    new Request("http://localhost/api/v1/evaluations/evaluation-1", {headers}),
    {params: Promise.resolve({id: "evaluation-1"})},
  );
  const csv = await exportForecast(
    new Request("http://localhost/api/v1/forecasts/forecast-1/export", {headers}),
    {params: Promise.resolve({id: "forecast-1"})},
  );
  assert.equal(evaluation.status, 200);
  assert.equal((await evaluation.json()).evaluation.id, "evaluation-1");
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("Content-Type") ?? "", /text\/csv/);
  assert.match(await csv.text(), /station-1/);
});
