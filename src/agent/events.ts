import type {approvals, events, runs} from "../db/schema";

export type RunRecord = typeof runs.$inferSelect;
export type EventRecord = typeof events.$inferSelect;
export type ApprovalRecord = typeof approvals.$inferSelect;
export type EventKind =
    | "run.created"
    | "run.started"
    | "tool.requested"
    | "tool.succeeded"
    | "tool.failed"
    | "evidence.added"
    | "approval.requested"
    | "approval.resolved"
    | "run.completed"
    | "run.failed"
    | "run.cancelled";
export type EventInput = {
  kind: EventKind;
  summary: string;
  data?: Record<string, unknown>;
};
export type PendingApproval = {
  toolCallId: string;
  toolName: string;
  toolArguments: unknown;
};
