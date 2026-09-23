import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = new URL("../../", import.meta.url);
test("synthetic fixture integrity and hourly coverage", () => {
  const data = readFileSync(new URL("samples/history.csv", root));
  const manifest = JSON.parse(readFileSync(new URL("samples/manifest.json", root)));
  assert.equal(createHash("sha256").update(data).digest("hex"), manifest.sha256);
  const rows = data.toString().trim().split("\n").slice(1).map(r => r.split(","));
  assert.equal(rows.length, manifest.rows);
  assert.equal(manifest.synthetic, true);
  for (const [i, row] of rows.entries()) {
    assert.equal(row[0], manifest.asset_id);
    assert.equal(Date.parse(row[1]), Date.parse(rows[0][1]) + i * 3600000);
    assert.ok(row.slice(2).every(v => v !== "" && Number.isFinite(Number(v))));
    assert.ok(Number(row[3]) >= 0 && Number(row[3]) <= 1);
  }
});
test("missing integration fails closed for every command; invalid input rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "s09-"));
  try {
    cpSync(new URL("tests/acceptance/", root), join(dir, "tests/acceptance"), { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"scripts":{}}');
    for (const action of ["import", "train", "backtest", "export", "verify"]) {
      const result = spawnSync(process.execPath, [join(dir, "tests/acceptance/run.mjs"), action], { encoding: "utf8" });
      assert.equal(result.status, 2);
      assert.equal(JSON.parse(result.stderr).status, "BLOCKED");
    }
    assert.equal(spawnSync(process.execPath, [join(dir, "tests/acceptance/run.mjs"), "unknown"]).status, 64);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
