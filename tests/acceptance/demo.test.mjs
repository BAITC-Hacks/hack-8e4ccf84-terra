import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('demo commands are wired and unsafe database fails closed', () => {
  const pkg = JSON.parse(readFileSync('package.json','utf8'));
  for (const action of ['import','train','backtest','export','verify']) assert.equal(pkg.scripts[`demo:${action}`], `node scripts/demo-acceptance.mjs ${action}`);
  const directory = mkdtempSync(join(tmpdir(), 'p7-acceptance-'));
  try {
  const result = spawnSync(process.execPath, ['scripts/demo-acceptance.mjs','verify'], {encoding:'utf8', env:{...process.env, DEMO_REPORT_DIR:directory, DEMO_DISPOSABLE:'0', DEMO_TEST_DATABASE_URL:''}});
  assert.equal(result.status,2);
  assert.equal(JSON.parse(result.stderr).status,'BLOCKED');
  assert.equal(JSON.parse(readFileSync(join(directory,'historical.json'),'utf8')).status,'BLOCKED');
  } finally { rmSync(directory, {recursive:true, force:true}); }
});
test('unknown action cannot invoke commands', () => {
  assert.equal(spawnSync(process.execPath,['scripts/demo-acceptance.mjs','unknown']).status,64);
});
