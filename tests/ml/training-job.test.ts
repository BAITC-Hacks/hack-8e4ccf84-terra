import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {FileTrainingJobStore, TrainingJobConflictError, type ModelArtifact} from "../../src/server/ml/training";

function jobInput() {
  const examples = [];
  for (let month = 0; month < 14; month += 1) {
    for (let day = 1; day <= 28; day += 1) {
      const date = new Date(Date.UTC(2025, month, day));
      const windSpeed = 3 + (day % 10);
      examples.push({
        timestamp: date.toISOString(),
        windSpeed,
        temperature: month + day / 10,
        assetId: "station",
        leadHours: day % 48,
        target: 0.03 * windSpeed ** 3,
      });
    }
  }
  return {
    cutoff: "2026-02-01T00:00:00.000Z",
    examples,
    codeVersion: "test-sha",
    ridgeLambdas: [0.1],
  };
}

test("file job store is idempotent and persists a resumable JSON model artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "wind-ml-test-"));
  try {
    const store = new FileTrainingJobStore(root);
    const first = await store.create(jobInput(), "same-key");
    const replay = await store.create(jobInput(), "same-key");
    assert.equal(replay.id, first.id);
    await assert.rejects(
      store.create({...jobInput(), seed: 7}, "same-key"),
      TrainingJobConflictError,
    );
    let current = first;
    for (let step = 0; step < 100 && current.status !== "completed"; step += 1) {
      current = await store.advance(current.id, {rows: 50, iterations: 100});
    }
    assert.equal(current.status, "completed", current.error?.message);
    assert.equal(current.progress, 1);
    const artifact = JSON.parse(await readFile(current.artifactPath!, "utf8")) as ModelArtifact;
    assert.equal(artifact.codeVersion, "test-sha");
    assert.equal(artifact.cutoff, "2026-02-01T00:00:00.000Z");
    assert.equal(artifact.validation.requestedFolds, 3);
    assert.ok(!JSON.stringify(artifact).includes("null"), "artifact must not encode non-finite numbers as null");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
