/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node test runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(file) {
  const candidate = path.resolve(file);
  const filename = fs.existsSync(candidate + '.ts') ? candidate + '.ts' : path.join(candidate, 'index.ts');
  const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = id => id.startsWith('.') ? load(path.resolve(path.dirname(filename), id)) : original(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return mod.exports;
}
const { messages } = load('src/lib/i18n/messages');
const { translate, validLocale, validTheme, formatNumber, formatDate } = load('src/lib/i18n');
const { safeReturnPath } = load('src/lib/navigation');
const { createClient } = load('src/components/dashboard/client');
test('all owned interface and fixture copy has English and Kazakh translations', () => {
  const missing = new Set();
  for (const dir of ['src/components/dashboard', 'src/components/platform']) {
    for (const file of fs.readdirSync(dir).filter(name => /\.tsx?$/.test(name))) {
      const source = ts.createSourceFile(file, fs.readFileSync(path.join(dir, file), 'utf8'), ts.ScriptTarget.Latest, true);
      function visit(node) {
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[А-Яа-яЁё]/.test(node.text) && !messages[node.text.trim()]) missing.add(node.text.trim());
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  assert.deepEqual([...missing], []);
  for (const [key, values] of Object.entries(messages)) {
    const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const locale of ['kk', 'en']) { assert.ok(values[locale]); assert.deepEqual(placeholders(values[locale]), placeholders(key), key); }
  }
});
test('Russian/light defaults, localized dates/numbers and interpolation preserve meaning', () => {
  assert.equal(validLocale(undefined), 'ru'); assert.equal(validLocale('kz'), 'ru'); assert.equal(validTheme('invalid'), 'light');
  assert.equal(translate('en', ' Прогноз '), ' Forecast ');
  assert.equal(translate('kk', 'Обзор'), 'Шолу');
  assert.equal(translate('en', 'Экспорт недоступен (HTTP {status}).', {status: 503}), 'Export unavailable (HTTP 503).');
  assert.equal(formatNumber(0, 'en'), '0'); assert.equal(formatNumber(null, 'en'), 'No data');
  assert.match(formatDate('2026-01-31T12:00:00Z', 'Asia/Almaty', 'en'), /17:00/);
  assert.equal(formatDate('2026-01-31T23:00:00Z', 'Asia/Almaty', 'kk'), '01 ақп., 04:00');
});
test('return destination allowlist prevents external or unrelated redirects', () => {
  for (const value of [undefined, 'https://evil.test', '//evil.test', '/\\evil.test', '/api/auth/session', '/login', '/%2f%2fevil.test']) assert.equal(safeReturnPath(value), '/history');
  assert.equal(safeReturnPath('/forecast?run=run-1'), '/forecast?run=run-1');
});
test('fixture localization preserves identifiers, dates and numeric series', async () => {
  const ru = createClient('fixture','backtest','ready','ru'); const en = createClient('fixture','backtest','ready','en'); const kk = createClient('fixture','backtest','ready','kk');
  const [r,e,k] = await Promise.all([ru.forecasts(),en.forecasts(),kk.forecasts()]);
  assert.deepEqual(r[0].points,e[0].points); assert.equal(r[0].id,k[0].id);
  assert.doesNotMatch(e[0].briefing, /[А-Яа-я]/); assert.notEqual(r[0].briefing,k[0].briefing);
  assert.equal((await en.assets())[0].id,'demo-line');
});
