import type {ForecastRequest, Observation} from "../../contracts";
import type {ForecastInputSnapshot} from "../../data/snapshot/build";
import {predictPersistence} from "../baseline/persistence";
import {createFeatureDefinition, type TrainingExample} from "../features";
import {artifactChecksum, contentHash, forecastFeatureSpecSchema, parseDeployableArtifact, type DeployableModelArtifact} from "../inference/artifact";
import {prepareForecastExamples, utcMillis, type ForecastFeatureSpec} from "../inference/features";
import {fitMeanBaseline, fitPowerCurve} from "../power-curve";
import {trainRidge} from "../ridge";
import {validateCandidates, type ValidationMetrics, type ValidationOptions} from "../validation";

export interface TrainingRelease {
  request: ForecastRequest;
  snapshot: ForecastInputSnapshot;
  /** Only canonical historical training observations, never evaluation-only storage. */
  targets: Observation[];
}
export interface ApprovedTrainingInput {
  cutoff: string;
  createdAt: string;
  codeVersion: string;
  modelVersionId: string;
  version: string;
  evidence: "historical" | "synthetic";
  targetDataPolicy: "history_only";
  featureSpec: ForecastFeatureSpec;
  releases: TrainingRelease[];
  ridgeLambdas?: number[];
}

function score(actual: number[], predicted: number[]): ValidationMetrics {
  if (!actual.length || actual.length !== predicted.length) throw new Error("No paired validation data");
  const errors = actual.map((value, i) => predicted[i] - value);
  return {mae: errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length,
    rmse: Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length), count: errors.length};
}

/** Deterministic offline training over canonical snapshots; no database or evaluation reads. */
export function trainApprovedModel(input: ApprovedTrainingInput): DeployableModelArtifact {
  const cutoff = utcMillis(input.cutoff, "cutoff");
  utcMillis(input.createdAt, "createdAt");
  if (input.cutoff > "2026-02-01T00:00:00.000Z" || input.targetDataPolicy !== "history_only" ||
      !["historical", "synthetic"].includes(input.evidence) || !input.codeVersion?.trim() ||
      !input.modelVersionId?.trim() || !input.version?.trim()) throw new Error("Invalid training metadata or target policy");
  const spec = forecastFeatureSpecSchema.parse(input.featureSpec);
  const rows: TrainingExample[] = [];
  const baseline = new Map<string, number>();
  const snapshots: string[] = [];
  const key = (row: TrainingExample) => `${row.assetId}|${row.timestamp}|${row.leadHours}`;
  for (const release of input.releases) {
    const {request, snapshot} = release;
    const examples = prepareForecastExamples(request, snapshot, spec);
    if (release.targets.length !== examples.length) throw new Error("Training targets must match forecast points exactly");
    if (utcMillis(request.issuedAt, "issuedAt") >= cutoff) throw new Error("Release is outside training cutoff");
    // A snapshot must contain exactly the selected latest eligible observation per asset,
    // matching the production persistence contract. Never derive it from future targets.
    for (const assetId of request.assetIds) {
      const selected = snapshot.observations.filter((row) => row.assetId === assetId);
      const observation = selected[0];
      if (selected.length !== 1 || observation.metric !== "normalized_power" || observation.unit !== "normalized" ||
          observation.qualityFlag !== "accepted" || !Number.isFinite(observation.value) || !observation.availableAt ||
          utcMillis(observation.eventTime, "observation eventTime") > Date.parse(request.issuedAt) ||
          utcMillis(observation.availableAt, "observation availableAt") > Date.parse(request.issuedAt)) {
        throw new Error("Missing or invalid as-of persistence observation");
      }
    }
    const predictions = predictPersistence(request, snapshot);
    for (const example of examples) {
      if (utcMillis(example.timestamp, "targetTime") >= cutoff) throw new Error("Training target reaches cutoff/evaluation period");
      const targets = release.targets.filter((row) => row.assetId === example.assetId && row.eventTime === example.timestamp);
      const target = targets[0];
      if (targets.length !== 1 || target.metric !== "normalized_power" || target.unit !== "normalized" ||
          target.qualityFlag !== "accepted" || !Number.isFinite(target.value) || !target.availableAt ||
          utcMillis(target.availableAt, "target availableAt") >= cutoff || target.availableAt < target.eventTime) {
        throw new Error("Missing, duplicate, invalid or unavailable training target");
      }
      if (baseline.has(key(example))) throw new Error("Duplicate training example");
      const prediction = predictions.find((row) => row.assetId === example.assetId && row.targetTime === example.timestamp)!;
      baseline.set(key(example), prediction.value);
      rows.push({...example, target: target.value, issuedAt: request.issuedAt, targetAvailableAt: target.availableAt});
    }
    // Hash actual contents, rather than trusting caller-supplied snapshot.sha256.
    snapshots.push(contentHash({request, snapshot, targets: release.targets}));
  }
  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || key(a).localeCompare(key(b)));
  const options: ValidationOptions = {cutoff: input.cutoff, ridgeLambdas: input.ridgeLambdas ?? [0.1, 1, 10]};
  const validation = validateCandidates(rows, options);
  const selected = validation.candidates.find((row) => row.id === validation.selectedCandidateId)!;
  const folds = selected.folds.map((fold) => {
    const pairs = rows.filter((row) => row.timestamp >= fold.validationStart && row.timestamp < fold.validationEnd &&
      row.issuedAt! >= fold.validationStart);
    return {validationStart: fold.validationStart, validationEnd: fold.validationEnd,
      metrics: score(pairs.map((row) => row.target), pairs.map((row) => baseline.get(key(row))!))};
  });
  const count = folds.reduce((sum, fold) => sum + fold.metrics.count, 0);
  const aggregate = {count,
    mae: folds.reduce((sum, fold) => sum + fold.metrics.mae * fold.metrics.count, 0) / count,
    rmse: Math.sqrt(folds.reduce((sum, fold) => sum + fold.metrics.rmse ** 2 * fold.metrics.count, 0) / count)};
  const start = new Date(cutoff);
  if (selected.historyWindowMonths !== "full") start.setUTCMonth(start.getUTCMonth() - selected.historyWindowMonths);
  const training = rows.filter((row) => selected.historyWindowMonths === "full" || row.timestamp >= start.toISOString());
  const featureDefinition = createFeatureDefinition(training);
  const model = selected.kind === "ridge" ? trainRidge(training, featureDefinition, {lambda: selected.lambda!})
    : selected.kind === "power_curve" ? fitPowerCurve(training) : fitMeanBaseline(training);
  const improved = selected.kind !== "mean_baseline" && selected.aggregate!.mae < aggregate.mae;
  const approved = improved && input.evidence === "historical";
  const inputHash = contentHash({rows, baseline: [...baseline].sort(([a], [b]) => a.localeCompare(b)),
    snapshots: [...snapshots].sort(), spec, options, codeVersion: input.codeVersion, evidence: input.evidence});
  const artifact: DeployableModelArtifact = {
    schemaVersion: 1, id: inputHash, createdAt: input.createdAt, codeVersion: input.codeVersion, cutoff: input.cutoff,
    seed: 42, inputHash, trainingPeriod: {start: training[0].timestamp, end: input.cutoff, count: training.length},
    validation, selectedCandidateId: selected.id, model,
    deployment: {status: approved ? "approved" : "candidate", modelVersionId: input.modelVersionId,
      version: input.version, unit: "normalized", checksum: "", featureSpec: spec, featureDefinition,
      evidence: input.evidence, trainingSnapshotHashes: [...snapshots].sort(), persistence: {aggregate, folds},
      approvalReason: input.evidence === "synthetic" ? "Synthetic evidence cannot approve a production model"
        : improved ? "Lower pooled MAE than persistence on identical pre-cutoff temporal pairs"
        : "Improvement over persistence was not demonstrated"},
  };
  artifact.deployment.checksum = artifactChecksum(artifact);
  return parseDeployableArtifact(artifact);
}
