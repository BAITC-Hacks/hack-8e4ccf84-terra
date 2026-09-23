/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness supports runner-provided NODE_PATH dependencies. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
function load(name, parent = path.resolve("src/components/dashboard")) {
  const candidate = path.resolve(parent, name);
  const filename = fs.existsSync(candidate + ".ts") ? candidate + ".ts" : path.join(candidate, "index.ts");
  if (cache.has(filename)) return cache.get(filename);
  const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = id => id.startsWith('.') ? load(id, path.dirname(filename)) : originalRequire(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
  cache.set(filename,mod.exports); return mod.exports;
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
test('fixture industrial connectors expose Oracle history and WinCC streaming workflows', async () => {
  const client = createClient('fixture','live','ready');
  for (const kind of ['oracle','wincc']) {
    assert.equal((await client.industrial(kind,{action:'test'})).status,'healthy');
    const discovery = await client.industrial(kind,{action:'discover'});
    assert.ok(discovery.resources.length > 0);
    const resource = discovery.resources[0];
    const enabled = await client.industrial(kind,{action:'enable',assetId:'demo-line',resource:resource.name,fields:resource.fields.slice(0,2),mapping:{a:resource.fields[0],b:resource.fields[1]}});
    assert.equal(enabled.enabled,true);
    assert.equal(enabled.mode,kind === 'oracle' ? 'history' : 'stream');
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

test('canonical assets, connections and synchronous CSV reports are adapted', async () => {
  const original = global.fetch; const client = createClient('api','live','ready');
  try {
    global.fetch = async () => Response.json({assets:[{id:'asset-1',name:'Turbine',time_zone:null,power_unit:null}]});
    assert.equal((await client.assets())[0].timezone,'UNKNOWN');
    global.fetch = async () => Response.json({connections:[{id:'csv',name:'History',type:'csv',enabled:false,status:'unchecked',lastSuccessAt:null,lastTestedAt:null,lastError:null}]});
    assert.equal((await client.connections())[0].coverage,null);
    global.fetch = async () => Response.json({id:'import-1',status:'completed',report:{read:3,accepted:2,rejected:1,duplicates:0,reasons:{invalid_row:1}},errorsUrl:'/api/v1/imports/import-1/errors'});
    assert.equal((await client.importReport('import-1')).rejected,1);
    global.fetch = async (_url,init) => { assert.ok(init.body.has('config')); return Response.json({id:'import-1'}); };
    const form = new FormData(); form.set('config','{}'); assert.equal((await client.importCsv(form)).id,'import-1');
    global.fetch = async () => Response.json({error:{code:'not_configured',message:'private secret'}},{status:503});
    await assert.rejects(client.industrial('postgres',{action:'test'}),/Серверный шлюз не настроен/);
  } finally {global.fetch=original;}
});
