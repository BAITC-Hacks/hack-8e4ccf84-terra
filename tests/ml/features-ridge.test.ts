import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeatures,
  createFeatureDefinition,
  fitScaler,
  scaleFeatures,
  type TrainingExample,
} from "../../src/server/ml/features";
import {
  advanceRidgeTraining,
  createRidgeCheckpoint,
  predictRidge,
  trainRidge,
} from "../../src/server/ml/ridge";

function example(index: number): TrainingExample {
  const windSpeed = 2 + index * 0.2;
  const temperature = 10 + (index % 5);
  return {
    timestamp: new Date(Date.UTC(2025, 0, 1, index)).toISOString(),
    windSpeed,
    temperature,
    assetId: "turbine-1",
    leadHours: index % 48,
    target: 0.08 * windSpeed ** 2 + 0.01 * temperature,
  };
}

test("scaler is fitted only from supplied training rows", () => {
  const training = [example(0), example(1), example(2)];
  const definition = createFeatureDefinition(training);
  const scaler = fitScaler(training.map((row) => buildFeatures(row, definition)));
  const heldOut = {...example(3), windSpeed: 1_000_000};
  scaleFeatures(buildFeatures(heldOut, definition), scaler);
  assert.ok(Math.abs(scaler.means[0] - 2.2) < 1e-12);
});

test("ridge resumes from a JSON checkpoint and produces finite predictions", () => {
  const training = Array.from({length: 40}, (_, index) => example(index));
  const definition = createFeatureDefinition(training);
  const scaler = fitScaler(training.map((row) => buildFeatures(row, definition)));
  let checkpoint = createRidgeCheckpoint(definition.names.length);
  checkpoint = advanceRidgeTraining(training, definition, scaler, checkpoint, {lambda: 0.1}, {rows: 7});
  assert.equal(checkpoint.offset, 7);
  checkpoint = JSON.parse(JSON.stringify(checkpoint));
  while (checkpoint.phase !== "complete") {
    checkpoint = advanceRidgeTraining(
      training,
      definition,
      scaler,
      checkpoint,
      {lambda: 0.1, maxIterations: 2_000},
      {rows: 7, iterations: 100},
    );
  }
  assert.ok(checkpoint.weights.every(Number.isFinite));
  const artifact = trainRidge(training, definition, {lambda: 0.1, maxIterations: 2_000});
  assert.ok(Number.isFinite(predictRidge(artifact, example(41))));
});

test("non-finite input is rejected before feature generation", () => {
  const row = {...example(0), target: Number.NaN};
  assert.throws(() => createFeatureDefinition([row]), /must be finite/);
});
