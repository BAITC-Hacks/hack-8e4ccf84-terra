import assert from "node:assert/strict";
import {test} from "node:test";
import {runIndustrialAction} from "../../src/server/connectors/industrial/gateway";
import {industrialActionSchema} from "../../src/server/connectors/industrial/contracts";

const config = {baseUrl: "https://gateway.internal", token: "server-secret-token"};

test("PostgreSQL uses its own gateway path and disallows redirects", async () => {
  await runIndustrialAction("postgres", {action: "discover"}, async (url, init) => {
    assert.equal(String(url), "https://gateway.internal/v1/postgres/discover");
    assert.equal(init?.redirect, "error");
    return Response.json({action: "discover", resources: [{name: "scada.history", fields: ["time", "power"]}]});
  }, config);
});

test("enable rejects duplicate and unselected mappings", () => {
  const action = {action: "enable", assetId: "turbine", resource: "table", fields: ["time", "power"]};
  for (const mapping of [{timestamp: "time", power: "missing"}, {timestamp: "time", power: "time"}, {}])
    assert.equal(industrialActionSchema.safeParse({...action, mapping}).success, false);
});

test("Oracle gateway checks access without exposing its server token", async () => {
  let request: {url: string; init?: RequestInit} | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    request = {url: String(input), init};
    return Response.json({action: "test", status: "healthy", checkedAt: "2026-09-23T12:00:00Z", message: "Oracle reachable"});
  };
  const result = await runIndustrialAction("oracle", {action: "test"}, fetcher, config);
  assert.equal(result.action, "test");
  assert.equal(request?.url, "https://gateway.internal/v1/oracle/test");
  assert.equal(new Headers(request?.init?.headers).get("authorization"), "Bearer server-secret-token");
  assert.doesNotMatch(JSON.stringify(result), /server-secret-token/);
});

test("WinCC discovery and enable preserve explicit turbine mapping", async () => {
  const requests: unknown[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)); requests.push(body);
    if (body.action === "discover") return Response.json({action: "discover", resources: [{name: "WINCC_TAGS", fields: ["Power", "Wind"]}]});
    return Response.json({action: "enable", enabled: true, mode: "stream", startedAt: "2026-09-23T12:00:00Z", cursor: null});
  };
  const discovered = await runIndustrialAction("wincc", {action: "discover"}, fetcher, config);
  assert.equal(discovered.action, "discover");
  const enabled = await runIndustrialAction("wincc", {action: "enable", assetId: "turbine-1", resource: "WINCC_TAGS", fields: ["Power", "Wind"], mapping: {normalized_active_power: "Power", wind_speed: "Wind"}}, fetcher, config);
  assert.deepEqual(requests[1], {action: "enable", assetId: "turbine-1", resource: "WINCC_TAGS", fields: ["Power", "Wind"], mapping: {normalized_active_power: "Power", wind_speed: "Wind"}});
  assert.equal(enabled.action, "enable");
});

test("gateway failures are sanitized and malformed responses are rejected", async () => {
  await assert.rejects(
    runIndustrialAction("oracle", {action: "test"}, async () => new Response("private database details", {status: 503}), config),
    error => error instanceof Error && !error.message.includes("private database details") && /HTTP 503/.test(error.message),
  );
  await assert.rejects(
    runIndustrialAction("wincc", {action: "discover"}, async () => Response.json({tags: []}), config),
    /invalid response/,
  );
});
