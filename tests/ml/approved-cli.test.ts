import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import test from "node:test";
import {parseDeployableArtifact} from "../../src/server/ml/inference/artifact";
import {trainingInput} from "./approved-fixtures";

test("CLI writes reproducible candidate artifact/report, reports missing archives and clears stale success", async () => {
  const root = await mkdtemp(join(tmpdir(), "p2-approved-cli-"));
  const run = (args: string[]) => spawnSync(process.execPath,
    [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/train-approved.ts", "--out", root, ...args],
    {encoding: "utf8", timeout: 60_000});
  try {
    assert.equal(run([]).status, 2);
    assert.equal(JSON.parse(await readFile(join(root, "report.json"), "utf8")).status, "BLOCKED");
    const inputPath = join(root, "input.json");
    await writeFile(inputPath, JSON.stringify(trainingInput()));
    const first = run(["--input", inputPath]);
    assert.equal(first.status, 0, first.stderr);
    const firstReport = JSON.parse(await readFile(join(root, "report.json"), "utf8"));
    const artifact = parseDeployableArtifact(JSON.parse(await readFile(firstReport.artifact, "utf8")));
    assert.equal(artifact.deployment.status, "candidate");
    assert.equal(run(["--input", inputPath]).status, 0);
    assert.deepEqual(JSON.parse(await readFile(join(root, "report.json"), "utf8")), firstReport);
    await writeFile(inputPath, "{}");
    assert.equal(run(["--input", inputPath]).status, 1);
    const failed = JSON.parse(await readFile(join(root, "report.json"), "utf8"));
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.artifact, null);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
