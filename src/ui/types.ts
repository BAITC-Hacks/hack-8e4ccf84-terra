import type {AgentResult} from "../agent/types";
import type {RunStatus} from "../agent/state";

export type SafeError = { code: string; message: string; retryable: boolean };
export type RunView = {
  id: string;
  objective: string;
  status: RunStatus;
  model: string;
  domainKey: string;
  result: AgentResult | null;
  error: SafeError | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};
export type EventView = {
  id: string;
  seq: string;
  kind: string;
  summary: string;
  data: Record<string, unknown>;
  createdAt: string;
};
export type ApprovalView = {
  id: string;
  toolName: string;
  toolArguments: unknown;
  status: "pending" | "approved" | "rejected";
  decisionReason: string | null;
};
