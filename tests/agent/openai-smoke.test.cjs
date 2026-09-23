/* eslint-disable @typescript-eslint/no-require-imports -- opt-in smoke uses the installed SDK */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);

const enabled = process.env.RUN_OPENAI_SMOKE === '1';
test('real OpenAI returns a schema-valid allowed wind decision', { skip: !enabled }, async () => {
  assert.ok(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is required');
  assert.ok(process.env.OPENAI_MODEL, 'OPENAI_MODEL is required');
  const { loadAgentConfig, AgentDecisionSchema } = require('../../src/server/agent/schemas.ts');
  const { OpenAiWindAdapter } = require('../../src/server/agent/openai.ts');
  process.env.AGENT_LLM_ENABLED = 'true';
  const adapter = new OpenAiWindAdapter(loadAgentConfig());
  const issue = '2026-01-31T00:00:00.000Z';
  const decision = await adapter.decide({ request: { assetIds: ['asset'], issuedAt: issue,
    horizonHours: 24, mode: 'replay', modelVersionId: 'model', configVersion: 'smoke',
    dataPolicy: 'history_only', eventKey: 'smoke' }, weather: { id: 'weather', availableAt: issue,
    publishedAt: issue, targets: [], coverage: 1 }, observations: [],
    allowedActions: ['use_primary', 'stop'] }, { jobId: 'smoke', leaseToken: 'smoke',
    signal: AbortSignal.timeout(45_000) });
  assert.ok(['use_primary', 'stop'].includes(AgentDecisionSchema.parse(decision).action));
});
