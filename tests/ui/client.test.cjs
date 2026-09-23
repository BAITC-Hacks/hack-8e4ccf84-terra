/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness supports runner-provided NODE_PATH dependencies. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.resolve(`src/components/dashboard/${name}.ts`);
  const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = id => id.startsWith('./') ? load(id.slice(2)) : originalRequire(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
  cache.set(name,mod.exports); return mod.exports;
}
const schema = load('contracts'); const fixture = load('fixtures'); const {createClient} = load('client');
test('all synthetic fixtures obey runtime schemas in each mode and scenario', () => {
  schema.assetSchema.array().parse(fixture.assets); schema.connectionSchema.array().parse(fixture.connections);
  schema.importReportSchema.parse(fixture.report); schema.evaluationSchema.parse(fixture.evaluation);
  for (const mode of ['live','backtest','replay']) {
    schema.agentRunSchema.parse(fixture.agentRun(mode));
    for (const scenario of ['ready','empty','stale','partial']) {
      const runs = schema.forecastSchema.array().parse(fixture.forecasts(mode,scenario));
      assert.ok(runs.every(run => run.mode === mode));
      assert.ok(runs.every(run => new Set(run.points.map(p=>p.target_time)).size === run.points.length));
    }
  }
});
test('API adapter rejects malformed schemas, JSON, auth and network errors without exposing bodies', async () => {
  const originalFetch = global.fetch; const client = createClient('api','live','ready');
  try {
    global.fetch = async () => new Response('{"private":"secret"}',{status:200});
    await assert.rejects(client.assets(),/UI-контракту/);
    global.fetch = async () => new Response('private credentials invalid json',{status:200});
    await assert.rejects(client.assets(),/неверный формат данных/);
    global.fetch = async () => new Response('secret stacktrace',{status:401});
    await assert.rejects(client.assets(),/Требуется вход/);
    global.fetch = async () => { throw new Error('internal address'); };
    await assert.rejects(client.assets(),/Нет ответа API/);
    global.fetch = async () => new Response('<html>Login</html>',{status:200,headers:{'content-type':'text/html'}});
    await assert.rejects(client.exportCsv('run-1'),/неверный формат экспорта/);
  } finally { global.fetch = originalFetch; }
});
