import {InvalidTransitionError} from "./errors";

export const statuses = [
  "created",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof statuses)[number];
const transitions: Record<RunStatus, readonly RunStatus[]> = {
  created: ["running", "cancelled"],
  running: ["waiting_approval", "completed", "failed", "cancelled"],
  waiting_approval: ["running", "cancelled", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function assertTransition(from: RunStatus, to: RunStatus) {
  if (!transitions[from].includes(to)) throw new InvalidTransitionError();
}

export function isTerminal(status: RunStatus) {
  return transitions[status].length === 0;
}
