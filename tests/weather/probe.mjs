import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('Usage: node tests/weather/probe.mjs <output-directory>');
await mkdir(output, { recursive: true });
const cases = [
  ['feb-start', '2026-02-01T00:00', 'temperature_2m,wind_speed_10m,wind_speed_100m,wind_direction_100m'],
  ['jan-evening', '2026-01-31T18:00', 'temperature_2m,wind_speed_10m,wind_speed_100m,wind_direction_100m'],
  ['feb-end', '2026-02-28T00:00', 'temperature_2m,wind_speed_10m,wind_speed_100m,wind_direction_100m'],
  ['heights', '2026-02-01T00:00', 'wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_speed_200m,temperature_80m'],
  ['before-archive', '2023-03-11T00:00', 'temperature_2m,wind_speed_100m'],
];
const results = [];
for (const [name, run, hourly] of cases) {
  const url = new URL('https://single-runs-api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ latitude: '43.25', longitude: '76.95', models: 'ecmwf_ifs', run,
    hourly, wind_speed_unit: 'ms', temperature_unit: 'celsius', timezone: 'GMT', forecast_hours: '120' }).toString();
  const checked_at = new Date().toISOString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const raw = Buffer.from(await response.arrayBuffer());
    await writeFile(path.join(output, `${name}.raw.json`), raw);
    const data = JSON.parse(raw.toString());
    const times = data.hourly?.time ?? [];
    const fields = Object.fromEntries(hourly.split(',').map(field => [field, {
      unit: data.hourly_units?.[field], count: data.hourly?.[field]?.length,
      non_null: data.hourly?.[field]?.filter(x => Number.isFinite(x)).length,
    }]));
    const issue = Date.parse(run + ':00Z') + 12 * 3600000;
    const coverage = Object.fromEntries([24, 48].map(n => [n, Array.from({ length: n }, (_, i) =>
      new Date(issue + (i + 1) * 3600000).toISOString().slice(0, 16)).every(t => {
        const index = times.indexOf(t);
        return index >= 0 && hourly.split(',').every(f => Number.isFinite(data.hourly?.[f]?.[index]));
      })]));
    results.push({ name, checked_at, url: url.toString(), status: response.status,
      sha256: createHash('sha256').update(raw).digest('hex'), bytes: raw.length,
      keys: Object.keys(data), first: times[0], last: times.at(-1), count: times.length,
      fields, issue_for_coverage: new Date(issue).toISOString(), coverage, error: data.reason });
  } catch (error) { results.push({ name, checked_at, url: url.toString(), error: String(error) }); }
}
await writeFile(path.join(output, 'summary.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
