import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {
  buildFeatures,
  createFeatureDefinition,
  fitScaler,
  type FeatureDefinition,
  type StandardScaler,
  type TrainingExample,
} from "../features";
import {
  fitMeanBaseline,
  fitPowerCurve,
  type MeanBaselineArtifact,
  type PowerCurveArtifact,
} from "../power-curve";
import {
  advanceRidgeTraining,
  createRidgeCheckpoint,
  type RidgeArtifact,
  type RidgeCheckpoint,
} from "../ridge";
import {validateCandidates, type ValidationReport} from "../validation";
import {artifactPath, jobPath, writeJsonAtomic} from "./artifacts";
import {createTrainingJobSchema, type CreateTrainingJobInput} from "./schema";

export type TrainingJobStatus = "queued" | "running" | "completed" | "failed";

interface RidgeJobCheckpoint {
  definition: FeatureDefinition;
  scaler: StandardScaler;
  training: RidgeCheckpoint;
}

export interface TrainingJobRecord {
  id: string;
  status: TrainingJobStatus;
  phase: "validation" | "final_training" | "complete";
  progress: number;
  cutoff: string;
  codeVersion: string;
  seed: number;
  inputHash: string;
  idempotencyKeyHash?: string;
  input: CreateTrainingJobInput;
  validationReport?: ValidationReport;
  ridgeCheckpoint?: RidgeJobCheckpoint;
  artifactId?: string;
  artifactPath?: string;
  error?: {code: string; message: string};
  createdAt: string;
  updatedAt: string;
}

export interface ModelArtifact {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  codeVersion: string;
  cutoff: string;
  seed: number;
  inputHash: string;
  trainingPeriod: {start: string; end: string; count: number};
  validation: ValidationReport;
  selectedCandidateId: string;
  model: RidgeArtifact | PowerCurveArtifact | MeanBaselineArtifact;
}

export class TrainingJobConflictError extends Error {
  readonly code = "idempotency_conflict";
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function trainingRowsForSelection(
  examples: TrainingExample[],
  cutoffText: string,
  historyWindowMonths: 3 | 6 | 12 | "full",
): TrainingExample[] {
  const cutoff = new Date(cutoffText);
  const start = new Date(cutoff);
  if (historyWindowMonths !== "full") start.setUTCMonth(start.getUTCMonth() - historyWindowMonths);
  return examples
    .filter((example) => {
      const timestamp = new Date(example.timestamp);
      return timestamp < cutoff && (historyWindowMonths === "full" || timestamp >= start);
    })
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export class FileTrainingJobStore {
  constructor(readonly root: string) {}

  async create(rawInput: unknown, idempotencyKey?: string | null): Promise<TrainingJobRecord> {
    const input = createTrainingJobSchema.parse(rawInput);
    const inputHash = stableHash(input);
    const idempotencyKeyHash = idempotencyKey ? stableHash(idempotencyKey) : undefined;
    if (idempotencyKeyHash) {
      const indexPath = join(this.root, "idempotency", `${idempotencyKeyHash}.json`);
      try {
        const index = await readJson<{jobId: string; inputHash: string}>(indexPath);
        if (index.inputHash !== inputHash) {
          throw new TrainingJobConflictError("Idempotency-Key was already used with a different body");
        }
        return this.get(index.jobId);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const now = new Date().toISOString();
    const record: TrainingJobRecord = {
      id: crypto.randomUUID(),
      status: "queued",
      phase: "validation",
      progress: 0,
      cutoff: new Date(input.cutoff).toISOString(),
      codeVersion: input.codeVersion ?? process.env.GIT_COMMIT_SHA ?? "dev",
      seed: input.seed,
      inputHash,
      idempotencyKeyHash,
      input,
      createdAt: now,
      updatedAt: now,
    };
    await writeJsonAtomic(jobPath(this.root, record.id), record);
    if (idempotencyKeyHash) {
      await writeJsonAtomic(join(this.root, "idempotency", `${idempotencyKeyHash}.json`), {
        jobId: record.id,
        inputHash,
      });
    }
    return record;
  }

  get(jobId: string): Promise<TrainingJobRecord> {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Invalid training job id");
    return readJson(jobPath(this.root, jobId));
  }

  async save(record: TrainingJobRecord): Promise<void> {
    record.updatedAt = new Date().toISOString();
    await writeJsonAtomic(jobPath(this.root, record.id), record);
  }

  async advance(jobId: string, budget: {rows?: number; iterations?: number} = {}): Promise<TrainingJobRecord> {
    const record = await this.get(jobId);
    if (record.status === "completed" || record.status === "failed") return record;
    record.status = "running";
    try {
      if (record.phase === "validation") {
        record.validationReport = validateCandidates(record.input.examples, {
          cutoff: record.cutoff,
          historyWindows: record.input.historyWindows,
          ridgeLambdas: record.input.ridgeLambdas,
        });
        record.phase = "final_training";
        record.progress = 0.5;
        await this.save(record);
        return record;
      }

      if (record.phase === "final_training") {
        const report = record.validationReport!;
        const selected = report.candidates.find((candidate) => candidate.id === report.selectedCandidateId)!;
        const training = trainingRowsForSelection(
          record.input.examples,
          record.cutoff,
          selected.historyWindowMonths,
        );
        if (training.length === 0) throw new Error("Selected candidate has no final training rows");
        let model: ModelArtifact["model"] | undefined;
        if (selected.kind === "ridge") {
          if (!record.ridgeCheckpoint) {
            const definition = createFeatureDefinition(training);
            record.ridgeCheckpoint = {
              definition,
              scaler: fitScaler(training.map((example) => buildFeatures(example, definition))),
              training: createRidgeCheckpoint(definition.names.length),
            };
          }
          const ridge = record.ridgeCheckpoint;
          ridge.training = advanceRidgeTraining(
            training,
            ridge.definition,
            ridge.scaler,
            ridge.training,
            {lambda: selected.lambda!, maxIterations: 2_000},
            budget,
          );
          const accumulated = Math.min(1, ridge.training.offset / training.length);
          const optimized = Math.min(1, ridge.training.iteration / 2_000);
          record.progress = 0.5 + 0.5 * (ridge.training.phase === "accumulate" ? accumulated * 0.5 : 0.5 + optimized * 0.5);
          if (ridge.training.phase === "complete") {
            model = {
              kind: "ridge",
              featureDefinition: ridge.definition,
              scaler: ridge.scaler,
              weights: ridge.training.weights,
              lambda: selected.lambda!,
              iterations: ridge.training.iteration,
              converged: ridge.training.converged,
            };
          }
        } else if (selected.kind === "power_curve") {
          model = fitPowerCurve(training);
        } else {
          model = fitMeanBaseline(training);
        }
        if (model) {
          const artifactId = crypto.randomUUID();
          const path = artifactPath(this.root, artifactId);
          const artifact: ModelArtifact = {
            schemaVersion: 1,
            id: artifactId,
            createdAt: new Date().toISOString(),
            codeVersion: record.codeVersion,
            cutoff: record.cutoff,
            seed: record.seed,
            inputHash: record.inputHash,
            trainingPeriod: {
              start: training[0].timestamp,
              end: record.cutoff,
              count: training.length,
            },
            validation: report,
            selectedCandidateId: report.selectedCandidateId,
            model,
          };
          await writeJsonAtomic(path, artifact);
          record.artifactId = artifactId;
          record.artifactPath = path;
          record.phase = "complete";
          record.status = "completed";
          record.progress = 1;
          record.input.examples = [];
          delete record.ridgeCheckpoint;
        }
        await this.save(record);
      }
      return record;
    } catch (error) {
      record.status = "failed";
      record.error = {
        code: "training_failed",
        message: error instanceof Error ? error.message : "Training failed",
      };
      await this.save(record);
      return record;
    }
  }
}

export const trainingJobStore = new FileTrainingJobStore(
  process.env.ML_ARTIFACT_DIR ?? join(process.cwd(), ".data", "ml"),
);
