import {
  assertFinite,
  buildFeatures,
  type FeatureDefinition,
  fitScaler,
  scaleFeatures,
  type StandardScaler,
  type TrainingExample,
} from "../features";

export interface RidgeOptions {
  lambda: number;
  learningRate?: number;
  maxIterations?: number;
  tolerance?: number;
}

export interface RidgeCheckpoint {
  phase: "accumulate" | "optimize" | "complete";
  offset: number;
  iteration: number;
  xtx: number[][];
  xty: number[];
  weights: number[];
  previousObjective: number | null;
  converged: boolean;
}

export interface RidgeArtifact {
  kind: "ridge";
  featureDefinition: FeatureDefinition;
  scaler: StandardScaler;
  weights: number[];
  lambda: number;
  iterations: number;
  converged: boolean;
}

function zeros(size: number): number[] {
  return Array<number>(size).fill(0);
}

function matrix(size: number): number[][] {
  return Array.from({length: size}, () => zeros(size));
}

export function createRidgeCheckpoint(featureCount: number): RidgeCheckpoint {
  if (!Number.isInteger(featureCount) || featureCount < 1) {
    throw new Error("featureCount must be a positive integer");
  }
  const width = featureCount + 1;
  return {
    phase: "accumulate",
    offset: 0,
    iteration: 0,
    xtx: matrix(width),
    xty: zeros(width),
    weights: zeros(width),
    previousObjective: null,
    converged: false,
  };
}

function validateOptions(options: RidgeOptions): Required<RidgeOptions> {
  const resolved = {
    lambda: options.lambda,
    learningRate: options.learningRate ?? 0.05,
    maxIterations: options.maxIterations ?? 2_000,
    tolerance: options.tolerance ?? 1e-9,
  };
  assertFinite(resolved.lambda, "lambda");
  assertFinite(resolved.learningRate, "learningRate");
  assertFinite(resolved.tolerance, "tolerance");
  if (resolved.lambda < 0) throw new Error("lambda must be non-negative");
  if (resolved.learningRate <= 0) throw new Error("learningRate must be positive");
  if (!Number.isInteger(resolved.maxIterations) || resolved.maxIterations < 1) {
    throw new Error("maxIterations must be a positive integer");
  }
  if (resolved.tolerance <= 0) throw new Error("tolerance must be positive");
  return resolved;
}

export function advanceRidgeTraining(
  examples: TrainingExample[],
  definition: FeatureDefinition,
  scaler: StandardScaler,
  checkpoint: RidgeCheckpoint,
  options: RidgeOptions,
  budget: {rows?: number; iterations?: number} = {},
): RidgeCheckpoint {
  if (examples.length === 0) throw new Error("Cannot train ridge without examples");
  const resolved = validateOptions(options);
  const rowBudget = Math.max(1, Math.floor(budget.rows ?? 1_000));
  const iterationBudget = Math.max(1, Math.floor(budget.iterations ?? 50));
  const next = structuredClone(checkpoint);
  const width = definition.names.length + 1;
  if (next.weights.length !== width || next.xtx.length !== width || next.xty.length !== width) {
    throw new Error("Checkpoint dimensions do not match the feature definition");
  }

  if (next.phase === "accumulate" && next.offset === 0) {
    if (examples.length < 2) throw new Error("Degenerate training data: at least two rows are required");
    const first = buildFeatures(examples[0], definition);
    const hasVariation = examples.slice(1).some((example) =>
      buildFeatures(example, definition).some((value, index) => Math.abs(value - first[index]) > 1e-12),
    );
    if (!hasVariation) throw new Error("Degenerate training data: every feature row is identical");
  }

  if (next.phase === "accumulate") {
    const stop = Math.min(examples.length, next.offset + rowBudget);
    for (let rowIndex = next.offset; rowIndex < stop; rowIndex += 1) {
      const row = [1, ...scaleFeatures(buildFeatures(examples[rowIndex], definition), scaler)];
      const target = assertFinite(examples[rowIndex].target, `target ${rowIndex}`);
      for (let i = 0; i < width; i += 1) {
        next.xty[i] += row[i] * target;
        for (let j = 0; j < width; j += 1) next.xtx[i][j] += row[i] * row[j];
      }
    }
    next.offset = stop;
    if (stop === examples.length) next.phase = "optimize";
    return next;
  }

  if (next.phase === "optimize") {
    const lipschitzBound = next.xtx.reduce(
      (maximum, row, index) =>
        Math.max(
          maximum,
          row.reduce((sum, value, column) => sum + Math.abs(value) + (index === column && index > 0 ? resolved.lambda : 0), 0),
        ),
      0,
    );
    if (!Number.isFinite(lipschitzBound) || lipschitzBound <= 0) {
      throw new Error("Degenerate training matrix: no finite feature variance");
    }
    const step = Math.min(resolved.learningRate, 1 / lipschitzBound);
    for (let count = 0; count < iterationBudget && next.iteration < resolved.maxIterations; count += 1) {
      const gradient = next.xtx.map((row, index) => {
        const predictionTerm = row.reduce((sum, value, column) => sum + value * next.weights[column], 0);
        const penalty = index === 0 ? 0 : resolved.lambda * next.weights[index];
        return predictionTerm - next.xty[index] + penalty;
      });
      const gradientNorm = Math.sqrt(gradient.reduce((sum, value) => sum + value * value, 0));
      const objective = gradientNorm / examples.length;
      assertFinite(objective, "ridge objective");
      next.weights = next.weights.map((weight, index) =>
        assertFinite(weight - step * gradient[index], `ridge weight ${index}`),
      );
      next.iteration += 1;
      if (
        objective <= resolved.tolerance ||
        (next.previousObjective !== null && Math.abs(next.previousObjective - objective) <= resolved.tolerance)
      ) {
        next.converged = true;
        next.phase = "complete";
        break;
      }
      next.previousObjective = objective;
    }
    if (next.iteration >= resolved.maxIterations) next.phase = "complete";
  }
  return next;
}

export function trainRidge(
  examples: TrainingExample[],
  definition: FeatureDefinition,
  options: RidgeOptions,
): RidgeArtifact {
  const rows = examples.map((example) => buildFeatures(example, definition));
  const scaler = fitScaler(rows);
  let checkpoint = createRidgeCheckpoint(definition.names.length);
  while (checkpoint.phase !== "complete") {
    checkpoint = advanceRidgeTraining(examples, definition, scaler, checkpoint, options, {
      rows: Math.max(1, examples.length),
      iterations: options.maxIterations ?? 2_000,
    });
  }
  return {
    kind: "ridge",
    featureDefinition: definition,
    scaler,
    weights: checkpoint.weights,
    lambda: options.lambda,
    iterations: checkpoint.iteration,
    converged: checkpoint.converged,
  };
}

export function predictRidge(artifact: RidgeArtifact, example: TrainingExample): number {
  const features = scaleFeatures(
    buildFeatures(example, artifact.featureDefinition),
    artifact.scaler,
  );
  if (artifact.weights.length !== features.length + 1) {
    throw new Error("Ridge artifact dimensions are invalid");
  }
  return assertFinite(
    artifact.weights[0] + features.reduce((sum, value, index) => sum + value * artifact.weights[index + 1], 0),
    "ridge prediction",
  );
}
