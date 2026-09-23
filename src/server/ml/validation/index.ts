import {
  createFeatureDefinition,
  type TrainingExample,
  validateExample,
} from "../features";
import {
  fitMeanBaseline,
  fitPowerCurve,
  predictPowerCurve,
} from "../power-curve";
import {predictRidge, trainRidge} from "../ridge";

export type HistoryWindow = 3 | 6 | 12 | "full";
export type CandidateKind = "ridge" | "power_curve" | "mean_baseline";

export interface ValidationMetrics {
  mae: number;
  rmse: number;
  count: number;
}

export interface ValidationFoldResult {
  validationStart: string;
  validationEnd: string;
  trainingStart: string;
  trainingEnd: string;
  trainCount: number;
  validationCount: number;
  metrics: ValidationMetrics;
}

export interface CandidateReport {
  id: string;
  kind: CandidateKind;
  historyWindowMonths: HistoryWindow;
  lambda?: number;
  folds: ValidationFoldResult[];
  aggregate: ValidationMetrics | null;
  skipped: {validationStart: string; reason: string}[];
  eligible: boolean;
}

export interface ValidationReport {
  cutoff: string;
  foldMonths: number;
  requestedFolds: number;
  candidates: CandidateReport[];
  selectedCandidateId: string;
  commonPairPolicy: "same validation examples per fold";
  selectionMetric: "mae";
}

export interface ValidationOptions {
  cutoff: string;
  historyWindows?: readonly HistoryWindow[];
  ridgeLambdas?: readonly number[];
  foldMonths?: number;
  folds?: number;
  minimumTrainRows?: number;
  minimumValidationRows?: number;
  ridgeMaxIterations?: number;
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    1,
  ));
}

function instant(value: string, label: string): Date {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error(`${label} is not a valid instant`);
  return result;
}

function metrics(actual: number[], predicted: number[]): ValidationMetrics {
  if (actual.length === 0 || actual.length !== predicted.length) {
    throw new Error("Metrics require matching non-empty actual and prediction arrays");
  }
  let absolute = 0;
  let squared = 0;
  for (let index = 0; index < actual.length; index += 1) {
    const error = predicted[index] - actual[index];
    if (!Number.isFinite(error)) throw new Error(`Non-finite validation error at row ${index}`);
    absolute += Math.abs(error);
    squared += error * error;
  }
  return {
    mae: absolute / actual.length,
    rmse: Math.sqrt(squared / actual.length),
    count: actual.length,
  };
}

function aggregate(folds: ValidationFoldResult[]): ValidationMetrics | null {
  const count = folds.reduce((sum, fold) => sum + fold.metrics.count, 0);
  if (count === 0) return null;
  const mae = folds.reduce((sum, fold) => sum + fold.metrics.mae * fold.metrics.count, 0) / count;
  const mse = folds.reduce(
    (sum, fold) => sum + fold.metrics.rmse ** 2 * fold.metrics.count,
    0,
  ) / count;
  return {mae, rmse: Math.sqrt(mse), count};
}

function candidateId(kind: CandidateKind, window: HistoryWindow, lambda?: number): string {
  return [kind, `${window}m`, lambda === undefined ? undefined : `lambda-${lambda}`]
    .filter(Boolean)
    .join(":");
}

export function validateCandidates(
  source: TrainingExample[],
  options: ValidationOptions,
): ValidationReport {
  source.forEach(validateExample);
  const cutoff = instant(options.cutoff, "cutoff");
  const preCutoff = source
    .filter((example) => instant(example.timestamp, "example.timestamp") < cutoff)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  if (preCutoff.length === 0) throw new Error("No examples are available before cutoff");
  const historyWindows = options.historyWindows ?? [3, 6, 12, "full"];
  const ridgeLambdas = options.ridgeLambdas ?? [0.1, 1, 10];
  const foldMonths = options.foldMonths ?? 1;
  const requestedFolds = options.folds ?? 3;
  const minimumTrainRows = options.minimumTrainRows ?? 24;
  const minimumValidationRows = options.minimumValidationRows ?? 24;
  if (!Number.isInteger(foldMonths) || foldMonths < 1) throw new Error("foldMonths must be positive");
  if (!Number.isInteger(requestedFolds) || requestedFolds < 3) {
    throw new Error("At least three sequential validation folds are required");
  }

  const candidates: CandidateReport[] = [];
  for (const historyWindowMonths of historyWindows) {
    const descriptors: Array<{kind: CandidateKind; lambda?: number}> = [
      ...ridgeLambdas.map((lambda) => ({kind: "ridge" as const, lambda})),
      {kind: "power_curve"},
      {kind: "mean_baseline"},
    ];
    for (const descriptor of descriptors) {
      const folds: ValidationFoldResult[] = [];
      const skipped: CandidateReport["skipped"] = [];
      for (let foldIndex = requestedFolds; foldIndex >= 1; foldIndex -= 1) {
        const validationStart = addUtcMonths(cutoff, -foldIndex * foldMonths);
        const validationEnd = addUtcMonths(validationStart, foldMonths);
        const trainingStart = historyWindowMonths === "full"
          ? new Date(preCutoff[0].timestamp)
          : addUtcMonths(validationStart, -historyWindowMonths);
        const training = preCutoff.filter((example) => {
          const time = new Date(example.timestamp);
          return time >= trainingStart && time < validationStart;
        });
        const validation = preCutoff.filter((example) => {
          const time = new Date(example.timestamp);
          return time >= validationStart && time < validationEnd;
        });
        if (training.length < minimumTrainRows || validation.length < minimumValidationRows) {
          skipped.push({
            validationStart: validationStart.toISOString(),
            reason: `insufficient data: train=${training.length}/${minimumTrainRows}, validation=${validation.length}/${minimumValidationRows}`,
          });
          continue;
        }
        const predictions = (() => {
          if (descriptor.kind === "ridge") {
            const definition = createFeatureDefinition(training);
            const artifact = trainRidge(training, definition, {
              lambda: descriptor.lambda!,
              maxIterations: options.ridgeMaxIterations ?? 2_000,
            });
            return validation.map((example) => predictRidge(artifact, example));
          }
          if (descriptor.kind === "power_curve") {
            const artifact = fitPowerCurve(training);
            return validation.map((example) => predictPowerCurve(artifact, example.windSpeed));
          }
          const artifact = fitMeanBaseline(training);
          return validation.map(() => artifact.mean);
        })();
        folds.push({
          validationStart: validationStart.toISOString(),
          validationEnd: validationEnd.toISOString(),
          trainingStart: trainingStart.toISOString(),
          trainingEnd: validationStart.toISOString(),
          trainCount: training.length,
          validationCount: validation.length,
          metrics: metrics(validation.map((example) => example.target), predictions),
        });
      }
      candidates.push({
        id: candidateId(descriptor.kind, historyWindowMonths, descriptor.lambda),
        kind: descriptor.kind,
        historyWindowMonths,
        lambda: descriptor.lambda,
        folds,
        aggregate: aggregate(folds),
        skipped,
        eligible: folds.length >= 3,
      });
    }
  }
  const eligible = candidates
    .filter((candidate) => candidate.eligible && candidate.aggregate)
    .sort((left, right) =>
      left.aggregate!.mae - right.aggregate!.mae || left.id.localeCompare(right.id),
    );
  if (eligible.length === 0) {
    throw new Error("No candidate has at least three valid sequential validation folds");
  }
  return {
    cutoff: cutoff.toISOString(),
    foldMonths,
    requestedFolds,
    candidates,
    selectedCandidateId: eligible[0].id,
    commonPairPolicy: "same validation examples per fold",
    selectionMetric: "mae",
  };
}
