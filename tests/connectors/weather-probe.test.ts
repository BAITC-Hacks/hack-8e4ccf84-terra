import assert from "node:assert/strict";
import {test} from "node:test";
import {probeWeather} from "../../src/server/connectors/weather/probe";
import {FIELDS} from "../../src/server/connectors/weather/open-meteo";

const input = {latitude: 45, longitude: 65, initializedAt: "2026-01-01T00:00:00Z"};
const payload = {hourly: {time: ["2026-01-01T01:00"], ...Object.fromEntries(FIELDS.map(field => [field, [1]]))},
  hourly_units: {temperature_2m: "°C", wind_speed_10m: "m/s", wind_speed_100m: "m/s", wind_direction_100m: "°"}};
test("weather probe uses fixed Single Runs endpoint and explicit coordinates/units", async () => {
  const result = await probeWeather(input, async (url, init) => {
    const request = new URL(String(url));
    assert.equal(request.origin, "https://single-runs-api.open-meteo.com");
    assert.equal(request.searchParams.get("run"), "2026-01-01T00:00");
    assert.equal(request.searchParams.get("wind_speed_unit"), "ms");
    assert.equal(init?.redirect, "error");
    return Response.json(payload);
  });
  assert.equal(result.status, "healthy"); assert.equal(result.hours, 1); assert.equal(result.publishedAt, null);
});
test("weather rejects invalid coordinates, future/non-cycle runs before HTTP", async () => {
  const never: typeof fetch = async () => {throw new Error("HTTP must not run");};
  for (const invalid of [{...input, latitude: 91}, {...input, initializedAt: "2099-01-01T00:00:00Z"}, {...input, initializedAt: "2026-01-01T01:00:00Z"}])
    await assert.rejects(probeWeather(invalid, never), error => error instanceof Error && !error.message.includes("HTTP must not run"));
});
test("weather rejects bad payloads, units and private provider errors", async () => {
  for (const value of [{}, {...payload, hourly_units: {...payload.hourly_units, wind_speed_10m: "km/h"}}, {...payload, hourly: {...payload.hourly, wind_speed_100m: []}}])
    await assert.rejects(probeWeather(input, async () => Response.json(value)), /invalid response/);
  await assert.rejects(probeWeather(input, async () => new Response("private secret", {status: 403})), /run is unavailable/);
});
