import {sql} from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type {RunStatus} from "../agent/state";

const time = (name: string) => timestamp(name, {withTimezone: true});
export const runs = pgTable(
    "agent_run",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      domainKey: text("domain_key").notNull(),
      objective: text("objective").notNull(),
      status: text("status").$type<RunStatus>().notNull(),
      model: text("model").notNull(),
      configSnapshot: jsonb("config_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
      result: jsonb("result"),
      error: jsonb("error"),
      sdkState: text("sdk_state"),
      cancelRequestedAt: time("cancel_requested_at"),
      createdAt: time("created_at").notNull().defaultNow(),
      startedAt: time("started_at"),
      updatedAt: time("updated_at").notNull().defaultNow(),
      completedAt: time("completed_at"),
    },
    (t) => [
      check(
          "agent_run_status_check",
          sql`${t.status} in ('created','running','waiting_approval','completed','failed','cancelled')`,
      ),
    ],
);
export const events = pgTable(
    "agent_event",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      seq: bigint("seq", {mode: "bigint"})
      .generatedAlwaysAsIdentity()
      .notNull()
      .unique(),
      runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, {onDelete: "cascade"}),
      kind: text("kind").notNull(),
      summary: text("summary").notNull(),
      data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
      createdAt: time("created_at").notNull().defaultNow(),
    },
    (t) => [index("agent_event_run_seq_idx").on(t.runId, t.seq)],
);
export const approvals = pgTable(
    "approval",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, {onDelete: "cascade"}),
      toolCallId: text("tool_call_id").notNull(),
      toolName: text("tool_name").notNull(),
      toolArguments: jsonb("tool_arguments").notNull(),
      status: text("status")
      .$type<"pending" | "approved" | "rejected">()
      .notNull(),
      decisionReason: text("decision_reason"),
      resolvedBy: text("resolved_by"),
      requestedAt: time("requested_at").notNull().defaultNow(),
      resolvedAt: time("resolved_at"),
    },
    (t) => [
      unique("approval_run_call_unique").on(t.runId, t.toolCallId),
      index("approval_run_status_idx").on(t.runId, t.status),
      check(
          "approval_status_check",
          sql`${t.status} in ('pending','approved','rejected')`,
      ),
    ],
);
