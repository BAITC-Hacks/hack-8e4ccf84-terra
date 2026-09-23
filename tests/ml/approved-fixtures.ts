import type {ForecastRequest, Observation} from "../../src/server/contracts";
import type {ForecastInputSnapshot} from "../../src/server/data/snapshot/build";
import {targetHours} from "../../src/server/data/snapshot/build";
import type {ApprovedTrainingInput, TrainingRelease} from "../../src/server/ml/training/approved";
import {artifactChecksum, type DeployableModelArtifact} from "../../src/server/ml/inference/artifact";

export const featureSpec: ApprovedTrainingInput["featureSpec"] = {
  source: "archived_forecast", provider: "test-provider", weatherModel: "test-model",
  wind: {metric: "wind_speed", unit: "m/s", heightMetres: 100},
  temperature: {metric: "temperature", unit: "°C", heightMetres: 2},
};
function observation(eventTime: string, value: number): Observation {
  return {id: eventTime, assetId: "turbine", metric: "normalized_power", value, unit: "normalized",
    eventTime, availableAt: eventTime, ingestedAt: eventTime, revision: 1, qualityFlag: "accepted",
    sourceTimeZone: "UTC", availabilityAssumption: null, rawArtifactId: "synthetic"};
}
export function release(issuedAt = "2026-02-01T00:00:00.000Z", horizonHours: 24 | 48 = 48): TrainingRelease {
  const request: ForecastRequest = {assetIds: ["turbine"], issuedAt, horizonHours,
    mode: "replay", modelVersionId: "test-version", dataPolicy: "history_only"};
  const targets = targetHours(issuedAt, horizonHours);
  const weatherValues = targets.flatMap((targetTime, i) => [
    {runId: "run", targetTime, metric: "wind_speed", value: 3 + i % 12, unit: "m/s", heightMetres: 100},
    {runId: "run", targetTime, metric: "temperature", value: i % 8, unit: "°C", heightMetres: 2},
  ]);
  const snapshot: ForecastInputSnapshot = {id: "snapshot", issuedAt, assetIds: request.assetIds,
    observationRevisions: [], weatherRunIds: ["run"], payload: {}, configVersion: "test", sha256: "a".repeat(64),
    createdAt: issuedAt, observations: [observation(issuedAt, 0)],
    weatherRuns: [{id: "run", assetId: "turbine", provider: featureSpec.provider, model: featureSpec.weatherModel,
      runTime: issuedAt, availableAt: issuedAt, publishedAt: issuedAt, fetchedAt: issuedAt,
      rawArtifactId: "synthetic-weather", availabilityAssumption: null}], weatherValues, missing: []};
  return {request, snapshot, targets: targets.map((time, i) => observation(time, 0.04 * (3 + i % 12)))};
}
export function trainingInput(): ApprovedTrainingInput {
  return {cutoff: "2026-02-01T00:00:00.000Z", createdAt: "2026-09-23T00:00:00.000Z",
    codeVersion: "synthetic-test-code", modelVersionId: "test-version", version: "1",
    targetDataPolicy: "history_only", evidence: "synthetic", featureSpec: structuredClone(featureSpec),
    ridgeLambdas: [0.1], releases: [6, 7, 8, 9, 10, 11, 12].map((month) =>
      release(new Date(Date.UTC(2025, month, 5)).toISOString()))};
}
/** Test-only approval adapter; never emitted by the production trainer for synthetic data. */
export function approveFixture(source: DeployableModelArtifact): DeployableModelArtifact {
  const artifact = structuredClone(source);
  artifact.deployment.evidence = "historical";
  artifact.deployment.status = "approved";
  artifact.deployment.checksum = artifactChecksum(artifact);
  return artifact;
}
