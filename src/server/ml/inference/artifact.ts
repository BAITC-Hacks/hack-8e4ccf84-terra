import {createHash} from "node:crypto";
import {z} from "zod";
import {createFeatureDefinition} from "../features";
import type {ModelArtifact} from "../training/job";
import {utcMillis} from "./features";

const finite = z.number().finite();
const text = z.string().min(1);
const utc = z.string().refine((value) => {
  try { utcMillis(value, "timestamp"); return true; } catch { return false; }
}, "must be canonical UTC ISO");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const metrics = z.object({mae: finite.nonnegative(), rmse: finite.nonnegative(), count: z.number().int().positive()});
const definition = z.object({names: z.array(text).min(1), assetIds: z.array(text).min(1)});
const model = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("ridge"), featureDefinition: definition,
    scaler: z.object({means: z.array(finite), scales: z.array(finite.positive())}),
    weights: z.array(finite), lambda: finite.nonnegative(), iterations: z.number().int().positive(), converged: z.boolean()}),
  z.object({kind: z.literal("power_curve"), binWidth: finite.positive(),
    points: z.array(z.object({windSpeed: finite.nonnegative(), power: finite, count: z.number().int().positive()})).min(1)}),
  z.object({kind: z.literal("mean_baseline"), mean: finite}),
]);
const fold = z.object({validationStart: utc, validationEnd: utc, trainingStart: utc, trainingEnd: utc,
  trainCount: z.number().int().positive(), validationCount: z.number().int().positive(), metrics});
// Runtime validation of the existing schemaVersion=1 ModelArtifact; no parallel model format.
export const modelArtifactSchema = z.object({
  schemaVersion: z.literal(1), id: text, createdAt: utc, codeVersion: text, cutoff: utc,
  seed: z.number().int().nonnegative(), inputHash: hash,
  trainingPeriod: z.object({start: utc, end: utc, count: z.number().int().positive()}),
  validation: z.object({cutoff: utc, foldMonths: z.number().int().positive(), requestedFolds: z.number().int().min(3),
    selectedCandidateId: text, commonPairPolicy: z.literal("same validation examples per fold"), selectionMetric: z.literal("mae"),
    candidates: z.array(z.object({id: text, kind: z.enum(["ridge", "power_curve", "mean_baseline"]),
      historyWindowMonths: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal("full")]),
      lambda: finite.nonnegative().optional(), folds: z.array(fold), aggregate: metrics.nullable(),
      skipped: z.array(z.object({validationStart: utc, reason: text})), eligible: z.boolean()})).min(1)}),
  selectedCandidateId: text, model,
});
export const forecastFeatureSpecSchema = z.object({
  source: z.literal("archived_forecast"), provider: text, weatherModel: text,
  wind: z.object({metric: text, unit: z.literal("m/s"), heightMetres: finite.nonnegative().nullable()}),
  temperature: z.object({metric: text, unit: z.literal("°C"), heightMetres: finite.nonnegative().nullable()}),
});
export const deployableArtifactSchema = modelArtifactSchema.extend({
  deployment: z.object({
    status: z.enum(["candidate", "approved"]), modelVersionId: text, version: text,
    unit: z.literal("normalized"), checksum: hash,
    featureSpec: forecastFeatureSpecSchema, featureDefinition: definition,
    evidence: z.enum(["historical", "synthetic"]),
    trainingSnapshotHashes: z.array(hash).min(1),
    persistence: z.object({aggregate: metrics, folds: z.array(z.object({validationStart: utc, validationEnd: utc, metrics})).min(3)}),
    approvalReason: text,
  }),
});
export type DeployableModelArtifact = ModelArtifact & {deployment: z.infer<typeof deployableArtifactSchema>["deployment"]};

/** Sorted object keys make checksum stable after JSON serialization/reordering. */
export function contentHash(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item !== null && typeof item === "object") return Object.fromEntries(
      Object.entries(item).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]));
    if (typeof item === "number" && !Number.isFinite(item)) throw new Error("Non-finite artifact value");
    return item;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function artifactChecksum(artifact: DeployableModelArtifact): string {
  const copy = structuredClone(artifact);
  copy.deployment.checksum = "";
  return contentHash(copy);
}

export function parseDeployableArtifact(raw: unknown): DeployableModelArtifact {
  const artifact = deployableArtifactSchema.parse(raw);
  if (artifactChecksum(artifact) !== artifact.deployment.checksum) throw new Error("Artifact checksum mismatch");
  const {deployment, validation} = artifact;
  if (artifact.cutoff > "2026-02-01T00:00:00.000Z" || validation.cutoff !== artifact.cutoff ||
      artifact.trainingPeriod.start >= artifact.trainingPeriod.end || artifact.trainingPeriod.end > artifact.cutoff) {
    throw new Error("Invalid training cutoff");
  }
  const expected = createFeatureDefinition(deployment.featureDefinition.assetIds.map((assetId) => ({
    assetId, timestamp: artifact.cutoff, leadHours: 1, windSpeed: 0, temperature: 0, target: 0,
  })));
  if (JSON.stringify(expected) !== JSON.stringify(deployment.featureDefinition)) throw new Error("Unsupported feature order");
  if (artifact.model.kind === "ridge") {
    const width = expected.names.length;
    if (JSON.stringify(artifact.model.featureDefinition) !== JSON.stringify(expected) ||
        artifact.model.weights.length !== width + 1 || artifact.model.scaler.means.length !== width ||
        artifact.model.scaler.scales.length !== width) throw new Error("Invalid ridge dimensions");
  }
  if (artifact.model.kind === "power_curve" && artifact.model.points.some((point, i, rows) =>
    i > 0 && point.windSpeed <= rows[i - 1].windSpeed)) throw new Error("Invalid power curve order");
  const selected = validation.candidates.find((row) => row.id === artifact.selectedCandidateId);
  if (!selected?.eligible || !selected.aggregate || selected.kind !== artifact.model.kind ||
      (artifact.model.kind === "ridge" && selected.lambda !== artifact.model.lambda) ||
      validation.selectedCandidateId !== selected.id || selected.folds.length !== validation.requestedFolds ||
      selected.folds.some((row) => row.trainingEnd > row.validationStart || row.validationEnd > artifact.cutoff ||
        row.trainingStart >= row.trainingEnd || row.validationStart >= row.validationEnd)) {
    throw new Error("Invalid temporal validation evidence");
  }
  if (deployment.persistence.folds.length !== selected.folds.length || selected.folds.some((row, i) => {
    const baseline = deployment.persistence.folds[i];
    return row.validationStart !== baseline.validationStart || row.validationEnd !== baseline.validationEnd ||
      row.metrics.count !== baseline.metrics.count;
  }) || selected.aggregate.count !== deployment.persistence.aggregate.count) throw new Error("Unpaired baseline evidence");
  for (const report of [selected, deployment.persistence]) {
    const count = report.folds.reduce((sum, row) => sum + row.metrics.count, 0);
    const mae = report.folds.reduce((sum, row) => sum + row.metrics.mae * row.metrics.count, 0) / count;
    const rmse = Math.sqrt(report.folds.reduce((sum, row) => sum + row.metrics.rmse ** 2 * row.metrics.count, 0) / count);
    if (report.aggregate!.count !== count || Math.abs(report.aggregate!.mae - mae) > 1e-10 ||
        Math.abs(report.aggregate!.rmse - rmse) > 1e-10) throw new Error("Inconsistent aggregate validation metrics");
  }
  if (deployment.status === "approved" && (deployment.evidence !== "historical" ||
      artifact.model.kind === "mean_baseline" || selected.aggregate.mae >= deployment.persistence.aggregate.mae)) {
    throw new Error("Approval requires historical improvement over persistence");
  }
  return artifact;
}
