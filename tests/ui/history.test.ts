import assert from "node:assert/strict";
import test from "node:test";
import { HISTORY_END, HISTORY_START, historyDays, historyDemoForecasts, historicalForecasts, historyResponseSchema, releasesForDay } from "../../src/components/dashboard/history-data";
import { createClient } from "../../src/components/dashboard/client";
import { safeReturnPath } from "../../src/lib/navigation";

test("historical issue calendar includes January 31 and every February day with strict bounds", () => {
  const days = historyDays(HISTORY_START, HISTORY_END);
  assert.equal(days.length, 29);
  assert.equal(days[0], HISTORY_START);
  assert.equal(days.at(-1), HISTORY_END);
  assert.deepEqual(historyDays("2026-02-28", "2026-02-28"), ["2026-02-28"]);
  for (const [start, end] of [["", HISTORY_END], ["2026-02-29", "2026-02-29"], [HISTORY_END, HISTORY_START], ["2026-01-30", HISTORY_END], [HISTORY_START, "2026-03-01"]]) {
    assert.deepEqual(historyDays(start, end), []);
  }
});

test("demo sequence isolates turbines and horizons, has no invented actuals, and retains March target hours", () => {
  const runs = historyDemoForecasts("demo-turbine-1", 48, "ready");
  assert.equal(runs.length, 29);
  assert.equal(runs.at(-1)?.points.at(-1)?.target_time, "2026-03-02T00:00:00.000Z");
  assert.ok(runs.every(run => run.points.length === 48 && run.points.every(p => p.actual === null)));
  assert.equal(releasesForDay(runs, "demo-turbine-2", 48, HISTORY_START).length, 0);
  assert.equal(releasesForDay(runs, "demo-turbine-1", 24, HISTORY_START).length, 0);
  assert.equal(historyDemoForecasts("demo-turbine-2", 24, "partial")[0].points.filter(p => p.prediction != null).length, 18);
  assert.deepEqual(historyDemoForecasts("demo-turbine-1", 24, "empty"), []);
});

function storedRun(status = "published") {
  return { id: "saved-run", status, version: 2, request: { assetIds: ["a", "b"], issuedAt: "2026-02-01T02:00:00+05:00", horizonHours: 24, mode: "replay", modelVersionId: "model" },
    inputSnapshotId: "snapshot", snapshot: { weatherRunIds: ["weather"] },
    values: [{ assetId: "a", targetTime: "2026-01-31T22:00:00Z", value: 0, unit: "normalized" },
      { assetId: "b", targetTime: "2026-01-31T22:00:00Z", value: 99, unit: "normalized" }] };
}

test("canonical adapter uses UTC issue days, preserves zero and gaps, and excludes other assets and incomplete predictions", () => {
  const decoded = historyResponseSchema.parse({ forecasts: [storedRun()] });
  const runs = historicalForecasts(decoded, "a");
  assert.equal(runs[0].points[0].prediction, 0);
  assert.equal(runs[0].points[1].prediction, null);
  assert.equal(releasesForDay(runs, "a", 24, HISTORY_START).length, 1);
  assert.equal(releasesForDay(runs, "a", 24, "2026-02-01").length, 0);
  assert.deepEqual(historicalForecasts(decoded, "unknown"), []);
  assert.ok(historicalForecasts(historyResponseSchema.parse({ forecasts: [storedRun("incomplete")] }), "a")[0].points.every(p => p.prediction === null));
  assert.equal(historyResponseSchema.safeParse({ forecasts: [{ ...storedRun(), values: [{ assetId: "a", targetTime: "2026-01-31T22:00:00Z", value: 1, unit: "MW" }] }] }).success, false);
});

test("API history reads canonical turbine and forecast envelopes, filters query, and fails without demo fallback", async () => {
  const original = global.fetch;
  const urls: string[] = [];
  const client = createClient("api", "live", "ready");
  try {
    global.fetch = async input => {
      const url = String(input); urls.push(url);
      return Response.json(url.endsWith("/assets") ? { assets: [{ id: "a", name: "A", kind: "turbine" }, { id: "s", name: "S", kind: "station" }] } : { forecasts: [storedRun()] });
    };
    assert.deepEqual((await client.historyAssets()).map(asset => asset.id), ["a"]);
    await client.historyForecasts("a", 24);
    assert.ok(urls.includes("/api/v1/forecasts?asset_id=a&horizon_hours=24&mode=backtest"));
    assert.ok(urls.includes("/api/v1/forecasts?asset_id=a&horizon_hours=24&mode=replay"));
    global.fetch = async () => Response.json({ forecasts: Array.from({ length: 100 }, () => storedRun()) });
    assert.equal((await client.historyForecasts("a", 24)).possiblyTruncated, true);
    global.fetch = async () => new Response("not available", { status: 503 });
    await assert.rejects(client.historyForecasts("a", 24), /HTTP 503/);
    assert.deepEqual(await client.historyForecasts("", 24), { runs: [], possiblyTruncated: false });
  } finally { global.fetch = original; }
});

test("historical scenario is the safe default landing page, while existing deep links remain valid", () => {
  assert.equal(safeReturnPath(undefined), "/history");
  assert.equal(safeReturnPath("https://evil.example"), "/history");
  assert.equal(safeReturnPath("/history"), "/history");
  assert.equal(safeReturnPath("/forecast?version=v1"), "/forecast?version=v1");
});
