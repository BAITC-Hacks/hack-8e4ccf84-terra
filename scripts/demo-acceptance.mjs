import {mkdirSync, writeFileSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import postgres from 'postgres';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const action = process.argv[2];
const groups = {
  import: ['tests/import/csv-import.test.ts', 'tests/import/hourly-quality.test.ts', 'tests/weather/ingestion.test.ts'],
  train: ['tests/ml/approved-inference.test.ts', 'tests/ml/approved-cli.test.ts', 'tests/runtime-wiring/inference.test.ts'],
  backtest: ['tests/triggers/postgres.test.ts', 'tests/runtime-wiring/postgres.test.ts', 'tests/replay-batch/batch.test.ts', 'tests/replay-batch/preflight.test.ts'],
  export: ['tests/evaluation/evaluation.test.ts', 'tests/evaluation/postgres.test.ts', 'tests/backtest/export-reproducibility.test.ts', 'tests/runtime-wiring/client.test.ts'],
};
if (![...Object.keys(groups), 'verify'].includes(action)) process.exit(64);
const directory = resolve(process.env.DEMO_REPORT_DIR ?? '.data/acceptance');
mkdirSync(directory, {recursive: true});
const commit = spawnSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).stdout.trim();
const save = (name, value) => writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2) + '\n');
const historical = {kind:'official-historical', status:'BLOCKED', commit, blockers:[
  'Verified historical weather publication provenance is not supplied.',
  'February 2026 evaluation actuals are absent from resource datasets.',
  'Owner confirmations of time semantics, coordinates and normalization are not supplied.',
  'A complete real-data release manifest and live API/UI evidence have not been verified.',
]};
save('historical.json', historical);
const url = process.env.DEMO_TEST_DATABASE_URL;
let safe = false;
try { const parsed = new URL(url); safe = ['localhost','127.0.0.1'].includes(parsed.hostname) && /test/i.test(parsed.pathname); } catch {}
if (!safe || process.env.DEMO_DISPOSABLE !== '1') {
  const report = {kind:'synthetic-integration', status:'BLOCKED', commit,
    blockers:['Set DEMO_DISPOSABLE=1 and DEMO_TEST_DATABASE_URL to a disposable local database whose name contains test. Suites mutate database state.']};
  save(`${action}.json`, report); console.error(JSON.stringify(report)); process.exit(2);
}
const env = {...process.env, DATABASE_URL:url, TEST_DATABASE_URL:url, P5_TEST_DATABASE_URL:url, P6_TEST_DATABASE_URL:url, AGENT_LLM_ENABLED:'false'};
const checks = [];
async function run(label, args) {
  try {
  let childEnv = env;
  if (!label.startsWith('migrate')) {
    const admin = postgres(url, {max:1, connect_timeout:5, connection:{statement_timeout:15000}});
    const name = `p7_test_${randomUUID().replaceAll('-', '')}`;
    try { await admin.unsafe(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
    const isolated = new URL(url); isolated.pathname = `/${name}`;
    childEnv = {...env, DATABASE_URL:isolated.toString(), TEST_DATABASE_URL:isolated.toString(), P5_TEST_DATABASE_URL:isolated.toString(), P6_TEST_DATABASE_URL:isolated.toString()};
    if (!['import','restart-replay'].includes(label)) {
      const migration = spawnSync(process.execPath, ['scripts/migrate.mjs'], {env:childEnv, encoding:'utf8', timeout:30000});
      if (migration.status !== 0) throw new Error('Isolated database migration failed');
    }
  }
  const start = Date.now();
  const result = await new Promise((done) => {
    const child = spawn(process.execPath, args, {env:childEnv, windowsHide:true, detached:process.platform !== 'win32'});
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true});
      else { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    }, 60000);
    child.on('error', () => { clearTimeout(timer); done({status:null, stdout, stderr:'Process launch failed'}); });
    child.on('close', code => { clearTimeout(timer); done({status:timedOut ? null : code, stdout, stderr:stderr + (timedOut ? '\nTIMEOUT: process tree terminated\n' : '')}); });
  });
  const log = `${label}.log`;
  writeFileSync(resolve(directory,log), (result.stdout ?? '') + (result.stderr ?? ''));
  checks.push({label, command:[process.execPath,...args], exitCode:result.status, status:result.status === 0 ? 'PASS':'FAIL', seconds:(Date.now()-start)/1000, log});
  console.log(`${label}: ${checks.at(-1).status}`);
  return result.status === 0;
  } catch {
    checks.push({label, status:'FAIL', error:'Disposable database setup failed; verify connectivity, CREATEDB and migrations.'});
    console.log(`${label}: FAIL (database setup)`);
    return false;
  }
}
let ok = await run('migrate', ['scripts/migrate.mjs']) && await run('migrate-repeat', ['scripts/migrate.mjs']);
if (ok) {
  for (const group of action === 'verify' ? Object.keys(groups) : [action]) {
    if (group === 'import') ok = await run('canonical-import', ['--import','tsx','--test','--test-timeout=45000','tests/import/postgres-smoke.ts']) && ok;
    ok = await run(group, ['--import','tsx','--test','--test-concurrency=1','--test-timeout=45000',...groups[group]]) && ok;
  }
  if (action === 'verify') ok = await run('restart-replay', ['--test','--test-timeout=45000','tests/agent/postgres.test.cjs','tests/agent/replay.test.cjs','tests/agent/reliability.test.cjs']) && ok;
}
const report = {kind:'synthetic-integration', status:ok ? 'PASS':'FAIL', scope:'Component integration suites using synthetic inputs; not a single shared end-to-end run.', commit, checks,
  endToEndStatus:'BLOCKED', remaining:['Shared import → trained model → trigger → replay → evaluation artifact chain', 'Live HTTP/browser validation and process-kill recovery'], officialResult:false};
save(`${action}.json`, report);
console.log(JSON.stringify({synthetic:report.status, endToEnd:report.endToEndStatus, historical:historical.status, reports:directory}));
process.exitCode = ok ? (action === 'verify' ? 2 : 0) : 1;
