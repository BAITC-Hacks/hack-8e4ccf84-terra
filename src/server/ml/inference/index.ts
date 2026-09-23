import type {ForecastRequest} from "../../contracts";
import type {ForecastInputSnapshot} from "../../data/snapshot/build";
import {predictPersistence} from "../baseline/persistence";
import {predictPowerCurve} from "../power-curve";
import {predictRidge} from "../ridge";
import {parseDeployableArtifact} from "./artifact";
import {prepareForecastExamples} from "./features";

export {parseDeployableArtifact, type DeployableModelArtifact} from "./artifact";
export {prepareForecastExamples, type ForecastFeatureSpec} from "./features";

/** Explicit baseline remains predictPersistence; invalid artifacts never silently fall back. */
export async function predictApprovedModel(
  request: ForecastRequest, snapshot: ForecastInputSnapshot, rawArtifact: unknown,
): Promise<ReturnType<typeof predictPersistence>> {
  const artifact = parseDeployableArtifact(rawArtifact);
  if (artifact.deployment.status !== "approved" || artifact.deployment.modelVersionId !== request.modelVersionId) {
    throw new Error("Model is not approved for the requested version");
  }
  if (artifact.cutoff > request.issuedAt) throw new Error("Model training cutoff is later than issue time");
  const examples = prepareForecastExamples(request, snapshot, artifact.deployment.featureSpec);
  return examples.map((example) => {
    if (!artifact.deployment.featureDefinition.assetIds.includes(example.assetId)) throw new Error("Unknown model asset");
    const value = artifact.model.kind === "ridge" ? predictRidge(artifact.model, example)
      : artifact.model.kind === "power_curve" ? predictPowerCurve(artifact.model, example.windSpeed)
      : artifact.model.mean;
    if (!Number.isFinite(value)) throw new Error("Invalid model prediction");
    return {assetId: example.assetId, targetTime: example.timestamp, value,
      unit: "normalized", qualityFlag: `trained_${artifact.model.kind}`};
  });
}
