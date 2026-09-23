import type {ObservationDraft} from "../import/types";

export type DataPurpose = "training" | "features" | "evaluation";

export function observationsForPurpose<T extends Pick<ObservationDraft, "dataUse">>(
  observations: T[],
  purpose: DataPurpose,
) {
  return purpose === "evaluation"
    ? observations
    : observations.filter((observation) => observation.dataUse !== "evaluation_only");
}
