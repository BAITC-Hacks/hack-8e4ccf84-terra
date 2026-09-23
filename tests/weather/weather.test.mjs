import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const load = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Test-only loader: no production package/config changes owned by S01.
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText, filename);
const { OpenMeteoWeather, availableAt, runUrl } = load('../../src/server/connectors/weather/open-meteo.ts');
const { selectWeatherRun, validateRun, targetHours } = load('../../src/server/data/weather/selection.ts');
const { WeatherError } = load('../../src/server/connectors/weather/types.ts');
const config = { latitude: 43.25, longitude: 76.95, availability: { kind: 'assumed', delayHours: 12,
  rationale: 'Synthetic test policy, not an approved production delay', approvalReference: 'TEST-ONLY' } };
const T = '2026-02-01T12:00:00.000Z';
const init = '2026-02-01T00:00:00.000Z';
const raw = fs.readFileSync(path.join(__dirname, 'evidence/feb-start.raw.json'));
const http = async () => new Response(raw);
const fail = async () => { throw new Error('network failure with private provider detail'); };
const connector = (fetcher = http, cfg = config) => new OpenMeteoWeather(cfg, fetcher, () => new Date('2026-09-23T09:00:00Z'));
const repository = (saved = []) => ({ saved, async save(run) { this.saved.push(structuredClone(run)); }, async list_saved() { return this.saved; } });
async function run() { return connector().fetch_run(init, T); }
function changeRaw(run, change) {
  const data = JSON.parse(Buffer.from(run.raw_base64, 'base64'));
  change(data);
  const bytes = Buffer.from(JSON.stringify(data));
  return { ...run, raw_base64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') };
}
const code = expected => error => error instanceof WeatherError && error.code === expected;

test('cycles obey assumed availability, including equality, and never list pre-archive runs', () => {
  const candidates = connector().list_runs(T);
  assert.equal(candidates[0].run_id, init);
  assert.equal(candidates[0].available_at, T);
  assert(candidates.every(r => Date.parse(r.available_at) <= Date.parse(T)));
  assert.deepEqual(connector().list_runs('2023-03-11T12:00:00Z'), []);
});
test('future availability rejected before HTTP even when initialization precedes T', async () => {
  let requests = 0;
  const c = connector(async () => { requests++; return http(); });
  await assert.rejects(c.fetch_run('2026-02-01T06:00:00Z', T), code('RUN_AFTER_AS_OF'));
  await assert.rejects(c.fetch_run('2026-02-02T00:00:00Z', T), code('RUN_AFTER_AS_OF'));
  assert.equal(requests, 0);
});
test('exact response bytes, hash, request identity and assumption are retained', async () => {
  const r = await run();
  assert.deepEqual(Buffer.from(r.raw_base64, 'base64'), raw);
  assert.equal(r.sha256, createHash('sha256').update(raw).digest('hex'));
  assert.equal(r.published_at, null);
  assert.equal(r.available_at, T);
  assert.deepEqual(r.availability, config.availability);
  const url = new URL(r.request_url);
  assert.equal(url.hostname, 'single-runs-api.open-meteo.com');
  assert.equal(url.searchParams.get('models'), 'ecmwf_ifs');
  assert.equal(url.searchParams.get('run'), '2026-02-01T00:00');
});
for (const horizon of [24, 48]) test(`real archived response gives exactly ${horizon} hours after T`, async () => {
  const repo = repository();
  const selected = await selectWeatherRun(connector(), repo, T, horizon);
  assert.equal(selected.points.length, horizon);
  assert.equal(selected.points[0].target_time, '2026-02-01T13:00:00.000Z');
  assert.equal(selected.points.at(-1).target_time, targetHours(T, horizon).at(-1));
  assert.equal(repo.saved.length, 1);
  assert.equal(selected.fallback, false);
});
for (const [label, change, expected] of [
  ['null', data => { data.hourly.wind_speed_100m[13] = null; }, 'INCOMPLETE_HORIZON'],
  ['missing hour', data => { for (const values of Object.values(data.hourly)) values.splice(13, 1); }, 'INCOMPLETE_HORIZON'],
  ['duplicate hour', data => { data.hourly.time[14] = data.hourly.time[13]; }, 'INVALID_RESPONSE'],
  ['wrong unit', data => { data.hourly_units.wind_speed_100m = 'km/h'; }, 'INVALID_RESPONSE'],
  ['short field', data => { data.hourly.temperature_2m.pop(); }, 'INVALID_RESPONSE'],
  ['negative wind', data => { data.hourly.wind_speed_10m[13] = -1; }, 'INVALID_RESPONSE'],
  ['absent field', data => { delete data.hourly.temperature_2m; }, 'INVALID_RESPONSE'],
  ['invalid UTC', data => { data.hourly.time[13] = '2026-02-30T00:00'; }, 'INVALID_TIME'],
]) test(`rejects ${label}`, async () => {
  assert.throws(() => validateRun(changeRaw(awaitedRun, change), config, T, 48), code(expected));
});
// Build a synchronous fixture for parameterized cases without any network.
const awaitedRun = { source: 'open-meteo-single-runs', model: 'ecmwf_ifs', latitude: config.latitude,
  longitude: config.longitude, initialized_at: init, available_at: T, published_at: null,
  downloaded_at: '2026-09-23T09:00:00.000Z', availability: config.availability,
  request_url: runUrl(config, init), raw_base64: raw.toString('base64'), sha256: createHash('sha256').update(raw).digest('hex') };

test('network outage uses a saved admissible complete run', async () => {
  const saved = await run();
  const result = await selectWeatherRun(connector(fail), repository([saved]), T, 48);
  assert.equal(result.fallback, true);
  assert.equal(result.reason, 'PROVIDER_ERROR');
  assert.equal(result.run.sha256, saved.sha256);
});
test('fallback chooses most recent initialization independently of DB ordering', async () => {
  const oldInit = '2026-01-31T18:00:00.000Z';
  const bytes = fs.readFileSync(path.join(__dirname, 'evidence/jan-evening.raw.json'));
  const old = await connector(async () => new Response(bytes)).fetch_run(oldInit, T);
  const current = await run();
  const result = await selectWeatherRun(connector(fail), repository([old, current]), T, 48);
  assert.equal(result.run.initialized_at, init);
});
test('outage with no saved run returns explicit safe error', async () => {
  await assert.rejects(selectWeatherRun(connector(fail), repository(), T, 48), code('NO_ADMISSIBLE_RUN'));
});
test('future, corrupt, wrong-location, changed-policy and incomplete saved runs cannot be fallback', async () => {
  const saved = await run();
  const future = { ...saved, initialized_at: '2026-02-01T06:00:00.000Z' };
  future.available_at = availableAt(future.initialized_at, future.downloaded_at, future.availability);
  future.request_url = runUrl(config, future.initialized_at);
  const invalid = [future, { ...saved, sha256: 'bad' }, { ...saved, latitude: 0 },
    { ...saved, availability: { ...saved.availability, approvalReference: 'other' } },
    changeRaw(saved, data => { data.hourly.temperature_2m[13] = null; })];
  for (const r of invalid) await assert.rejects(selectWeatherRun(connector(fail), repository([r]), T, 48), code('NO_ADMISSIBLE_RUN'));
});
test('no future actual-weather fallback request is attempted', async () => {
  const urls = [];
  const c = connector(async url => { urls.push(url); return new Response('unavailable', { status: 503 }); });
  await assert.rejects(selectWeatherRun(c, repository(), T, 24), code('NO_ADMISSIBLE_RUN'));
  assert.equal(urls.length, 1);
  assert(urls.every(url => new URL(url).hostname === 'single-runs-api.open-meteo.com'));
});
test('persistence failure cannot return an unsaved success', async () => {
  const repo = repository();
  repo.save = async () => { throw new Error('secret DB error'); };
  await assert.rejects(selectWeatherRun(connector(), repo, T, 48), code('PERSISTENCE_ERROR'));
});
test('observed availability does not backdate a download into a historical issue', async () => {
  const cfg = { ...config, availability: { kind: 'observed' } };
  await assert.rejects(connector(http, cfg).fetch_run(init, T), code('RUN_AFTER_AS_OF'));
  const c = new OpenMeteoWeather(cfg, http, () => new Date(T));
  const r = await c.fetch_run(init, T);
  assert.equal(r.available_at, T);
  assert.equal(validateRun(r, cfg, T, 24).length, 24);
});
test('bad config/time/horizon fails before network or storage', async () => {
  assert.throws(() => connector(http, { ...config, latitude: NaN }), code('INVALID_LOCATION'));
  assert.throws(() => connector(http, { ...config, availability: { kind: 'assumed', delayHours: 0 } }), code('INVALID_POLICY'));
  assert.throws(() => connector().list_runs('2026-02-01T00:00:00'), code('INVALID_TIME'));
  assert.throws(() => targetHours(T, 25), code('INVALID_HORIZON'));
  assert.throws(() => targetHours('2026-02-01T12:30:00Z', 24), code('INVALID_HORIZON'));
  await assert.rejects(connector().fetch_run('2026-02-01T01:00:00Z', T), code('INVALID_RUN'));
});
test('probe evidence hashes remain reproducible', () => {
  const summary = JSON.parse(fs.readFileSync(path.join(__dirname, 'evidence/summary.json')));
  for (const result of summary) {
    const bytes = fs.readFileSync(path.join(__dirname, `evidence/${result.name}.raw.json`));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), result.sha256);
  }
});

test('JSONB key reordering does not invalidate saved availability policy', async () => {
  const saved = await run();
  saved.availability = { approvalReference: config.availability.approvalReference,
    rationale: config.availability.rationale, delayHours: 12, kind: 'assumed' };
  const selected = await selectWeatherRun(connector(fail), repository([saved]), T, 48);
  assert.equal(selected.fallback, true);
});
test('24 hours cannot masquerade as complete 48-hour coverage', async () => {
  const short = changeRaw(await run(), data => {
    for (const values of Object.values(data.hourly)) values.splice(37);
  });
  assert.equal(validateRun(short, config, T, 24).length, 24);
  assert.throws(() => validateRun(short, config, T, 48), code('INCOMPLETE_HORIZON'));
});
test('valid zero wind is retained rather than mistaken for missing data', async () => {
  const calm = changeRaw(await run(), data => { data.hourly.wind_speed_100m[13] = 0; });
  assert.equal(validateRun(calm, config, T, 48)[0].wind_speed_100m, 0);
});
