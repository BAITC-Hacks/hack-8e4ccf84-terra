import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../../src/components/dashboard/csv.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { parseCsv, validateMapping, csvRows } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('CSV preview handles BOM, escaped quotes, CRLF and quoted delimiters/newlines', () => {
  assert.deepEqual(parseCsv('\ufefftime,wind,power,temp\r\n"2026,01",5,0.2,"a""b\nc"\r\n'), [['time','wind','power','temp'], ['2026,01','5','0.2','a"b\nc']]);
  assert.deepEqual(parseCsv('time;value\n1;0,5', ';'), [['time','value'],['1','0,5']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2', '\t'), [['a','b'],['1','2']]);
});
test('preview stops at six rows and rejects malformed quotes', () => {
  assert.equal(parseCsv('h\n1\n2\n3\n4\n5\n6\n"truncated').length, 6);
  assert.throws(() => parseCsv('a,b\n"broken'), /кавычки/);
  assert.throws(() => parseCsv('a,b\n"x"bad,2'), /кавычки/);
});
test('mapping rejects missing, duplicate and unknown columns', () => {
  const headers = ['t','w','p','c'];
  assert.equal(validateMapping(headers, {time:'t',wind:'w',power:'p',temp:'c'}), null);
  assert.ok(validateMapping(headers, {time:'t',wind:'w',power:'p',temp:'p'}));
  assert.ok(validateMapping(headers, {time:'t',wind:'w',power:'p',temp:'unknown'}));
  assert.ok(validateMapping(['t','t'], {}));
  assert.ok(validateMapping([''], {}));
});
test('export preserves nulls and zeros, escapes CSV and neutralizes formulas', () => {
  const csv = csvRows([['=IMPORTXML("x")', null, 0, -2, 'a,b']]);
  assert.equal(csv, '\ufeff"\'=IMPORTXML(""x"")","","0","-2","a,b"');
});
