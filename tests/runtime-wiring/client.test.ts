import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "../../src/components/dashboard/client";
import {fixture, request} from "../forecast/fixtures";

test("canonical envelopes retain model/mode, missing inputs and N=0 without synthetic fallback", async () => {
  const original = globalThis.fetch;
  const client = createClient("api", "live", "ready");
  try {
    const f = fixture();
    const run = await f.service.run({...request(), mode: "live"});
    globalThis.fetch = async () => Response.json({forecasts: [run]});
    const [actual] = await client.forecasts();
    assert.equal(actual.model_version, "baseline-v1");
    assert.equal(actual.mode, "live");
    assert.equal(actual.points[0].prediction, 0.39);
    assert.ok(actual.points.every(point => point.actual === null));
    f.data.weatherValues = [];
    const missing = await f.service.run({...request(), mode: "live"});
    globalThis.fetch = async () => Response.json({forecasts: [missing]});
    const [incomplete] = await client.forecasts();
    assert.match(incomplete.briefing, /weather:turbine-1/);
    assert.ok(incomplete.points.every(point => point.prediction === null));
    globalThis.fetch = async () => Response.json({evaluation: {id: "e", evaluatedPairCount: 0, coverage: 0,
      metrics: [{dimension: "overall", model: null, comparison: null}], exclusions: [{reason: "missing_actual"}]}});
    const evaluation = await client.evaluation("e");
    assert.equal(evaluation.mae, null);
    assert.equal(evaluation.rmse, null);
    assert.ok(evaluation.exclusions.includes("missing_actual"));
    globalThis.fetch = async () => Response.json({forecasts: []});
    assert.deepEqual(await client.forecasts(), []);
    globalThis.fetch = async () => Response.json({error: "private"}, {status: 503});
    await assert.rejects(client.forecasts(), /HTTP 503/);
    globalThis.fetch = async () => Response.json([]);
    await assert.rejects(client.forecasts(), /UI-контракту/);
  } finally {globalThis.fetch = original;}
});

test("durable launch, job progress/errors and paginated journal use real envelopes", async () => {
  const original = globalThis.fetch;
  const client = createClient("api", "backtest", "ready");
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "/api/v1/agent-runs");
      assert.equal(JSON.parse(init!.body as string).mode, "backtest");
      return Response.json({job_id: "j", agent_run_id: "j"}, {status: 202});
    };
    assert.equal((await client.startForecast({asset_ids: ["a"], issued_at: request().issuedAt, horizon_hours: 24,
      mode: "backtest", model_version: "baseline", data_policy: "history_only"}, true)).job_id, "j");
    globalThis.fetch = async () => Response.json({id: "j", status: "failed", progress: {step: 4, attempt: 1},
      result_id: null, error: {code: "MISSING_OBSERVATIONS"}});
    const job = await client.job("j");
    assert.equal(job.progress, 0.5);
    assert.equal(job.error, "MISSING_OBSERVATIONS");
    let pages = 0;
    globalThis.fetch = async url => {
      pages++;
      if (pages === 2) assert.match(String(url), /after=1/);
      return Response.json({id: "j", mode: "backtest", status: "succeeded", result_id: "f",
        events: [{id: String(pages), createdAt: request().issuedAt, step: "predict", reason: "validated",
          kind: "completed", details: {}}], next_cursor: pages === 1 ? 1 : null});
    };
    const run = await client.agentRun("j");
    assert.equal(run.forecast_id, "f");
    assert.equal(run.steps.length, 2);
  } finally {globalThis.fetch = original;}
});
