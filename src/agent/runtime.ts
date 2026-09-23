import {AppError} from "./errors";

const scope = globalThis as unknown as {
  workspaceRuns?: Map<string, AbortController>;
};
export const activeRuns = (scope.workspaceRuns ??= new Map());

export function registerRun(id: string) {
  if (activeRuns.has(id))
    throw new AppError("conflict", "This run is already executing.");
  const controller = new AbortController();
  activeRuns.set(id, controller);
  return controller;
}
