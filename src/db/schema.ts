import {sql} from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
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

export const connections = pgTable(
  "connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    status: text("status").notNull().default("untested"),
    lastTestedAt: time("last_tested_at"),
    lastSuccessAt: time("last_success_at"),
    lastError: text("last_error"),
    cursor: text("cursor"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [check("connection_type_check", sql`${t.type} in ('csv')`)],
);

export const fieldMappings = pgTable(
  "field_mapping",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, {onDelete: "cascade"}),
    assetId: text("asset_id").notNull(),
    dialect: jsonb("dialect").notNull(),
    mapping: jsonb("mapping").notNull(),
    timeConfig: jsonb("time_config").notNull(),
    units: jsonb("units").notNull(),
    hourlyCoverageThreshold: doublePrecision("hourly_coverage_threshold").notNull(),
    confirmed: boolean("confirmed").notNull().default(false),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("field_mapping_connection_unique").on(t.connectionId),
    check(
      "field_mapping_coverage_check",
      sql`${t.hourlyCoverageThreshold} between 0 and 1`,
    ),
  ],
);

export const rawArtifacts = pgTable("raw_artifact", {
  sha256: text("sha256").primaryKey(),
  path: text("path").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
});

export const dataImports = pgTable(
  "data_import",
  {
    id: uuid("id").primaryKey(),
    connectionId: uuid("connection_id").references(() => connections.id, {onDelete: "set null"}),
    rawSha256: text("raw_sha256").notNull().references(() => rawArtifacts.sha256),
    fingerprint: text("fingerprint").notNull().unique(),
    fileName: text("file_name").notNull(),
    status: text("status").notNull(),
    config: jsonb("config").notNull(),
    report: jsonb("report").notNull(),
    errorsUrl: text("errors_url"),
    error: text("error"),
    createdAt: time("created_at").notNull().defaultNow(),
    completedAt: time("completed_at"),
  },
  (t) => [
    index("data_import_sha_idx").on(t.rawSha256),
    check("data_import_status_check", sql`${t.status} in ('processing','completed','failed')`),
  ],
);

export const observations = pgTable(
  "observation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id").notNull().references(() => dataImports.id),
    sourceLine: integer("source_line").notNull(),
    assetId: text("asset_id").notNull(),
    metric: text("metric").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit").notNull(),
    eventTime: time("event_time").notNull(),
    availableAt: time("available_at").notNull(),
    ingestedAt: time("ingested_at").notNull().defaultNow(),
    revision: integer("revision").notNull(),
    sourceTimeZone: text("source_time_zone").notNull(),
    sourceTimestamp: text("source_timestamp").notNull(),
    dataUse: text("data_use").notNull(),
    qualityFlags: jsonb("quality_flags").$type<string[]>().notNull().default([]),
  },
  (t) => [
    unique("observation_revision_unique").on(t.assetId, t.metric, t.eventTime, t.revision),
    index("observation_current_idx").on(t.assetId, t.metric, t.eventTime),
    check("observation_data_use_check", sql`${t.dataUse} in ('training','evaluation_only')`),
  ],
);

/**
 * Canonical as-of observations consumed by the forecast subsystem.
 *
 * The CSV slice keeps its import/audit rows in `observation`; accepted
 * training rows are mirrored into this S01 table in the same transaction so
 * a completed import is immediately visible to the production forecast path.
 */
export const forecastObservations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id").notNull(),
    metric: text("metric").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit"),
    eventTime: time("event_time").notNull(),
    availableAt: time("available_at"),
    ingestedAt: time("ingested_at").notNull().defaultNow(),
    revision: integer("revision").notNull(),
    qualityFlag: text("quality_flag").notNull(),
    sourceTimeZone: text("source_time_zone"),
    availabilityAssumption: jsonb("availability_assumption").$type<Record<string, unknown> | null>(),
    rawArtifactId: uuid("raw_artifact_id"),
  },
  (t) => [
    unique("observations_asset_metric_time_revision_unique")
      .on(t.assetId, t.metric, t.eventTime, t.revision),
    index("observations_asof_idx").on(t.assetId, t.metric, t.eventTime, t.availableAt),
  ],
);

export const importErrors = pgTable(
  "import_error",
  {
    id: bigint("id", {mode: "bigint"}).generatedAlwaysAsIdentity().primaryKey(),
    importId: uuid("import_id").notNull().references(() => dataImports.id, {onDelete: "cascade"}),
    line: integer("line").notNull(),
    code: text("code").notNull(),
    message: text("message").notNull(),
    raw: jsonb("raw").$type<string[]>().notNull(),
  },
  (t) => [index("import_error_import_idx").on(t.importId)],
);
