import type {ForecastRequest, ModelVersion} from "../contracts";
import type {ForecastInputSnapshot} from "../data/snapshot/build";
import {predictPersistence} from "../ml/baseline/persistence";

/** P2 supplies the approved artifact loader/predictor at this boundary. Never fall back on failure. */
export type ForecastInference = (request: ForecastRequest, snapshot: ForecastInputSnapshot,
  model: ModelVersion) => Promise<ReturnType<typeof predictPersistence>>;

export const baselineInference: ForecastInference = async (request, snapshot, model) => {
  assertApprovedModel(request, model);
  if (model.name !== "persistence") throw new Error("MODEL_INFERENCE_NOT_IMPLEMENTED");
  return predictPersistence(request, snapshot);
};

export function assertApprovedModel(request: ForecastRequest, model: ModelVersion): void {
  if (request.modelVersionId !== model.id || model.status !== "approved" ||
    (model.name !== "persistence" && (!model.version || !model.artifactId))) throw new Error("MODEL_NOT_APPROVED");
}
