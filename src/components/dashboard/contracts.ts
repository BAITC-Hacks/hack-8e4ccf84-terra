// UI-local proposal based on PLAN.md §6/8, pending the published S01 contract.
import { z } from "zod";
const timestamp = z.iso.datetime({ offset: true });
export const modeSchema = z.enum(["live", "backtest", "replay"]);
export type Mode = z.infer<typeof modeSchema>;
export type Transport = "api" | "fixture";
export type Scenario = "ready" | "empty" | "error" | "stale" | "partial" | "loading";
export const assetSchema = z.object({ id: z.string(), name: z.string(), timezone: z.string(), unit: z.literal("normalized"), description: z.string() });
export const pointSchema = z.object({ target_time: timestamp, lead_hour: z.number().int().positive(), prediction: z.number().finite().nullable(), actual: z.number().finite().nullable(), status: z.string() });
export const forecastSchema = z.object({ id: z.string(), asset_id: z.string(), issued_at: timestamp, mode: modeSchema, horizon_hours: z.union([z.literal(24), z.literal(48)]), model_version: z.string(), weather_run_id: z.string(), input_snapshot_id: z.string(), unit: z.literal("normalized"), stale: z.boolean(), briefing: z.string(), points: z.array(pointSchema) });
export const connectionSchema = z.object({ id: z.string(), name: z.string(), type: z.string(), status: z.enum(["ready", "stale", "error", "planned"]), updated_at: timestamp.nullable(), coverage: z.number().min(0).max(1).nullable(), error: z.string().nullable() });
export const importReportSchema = z.object({ id: z.string(), status: z.enum(["running", "succeeded", "failed"]), read: z.number().int().nonnegative(), accepted: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative(), issues: z.array(z.object({ row: z.number().int(), reason: z.string() })) });
export const evaluationSchema = z.object({ id: z.string(), n: z.number().int().nonnegative(), coverage: z.number().min(0).max(1), mae: z.number().nonnegative().nullable(), rmse: z.number().nonnegative().nullable(), baseline_mae: z.number().nonnegative().nullable(), exclusions: z.array(z.string()) });
export const agentRunSchema = z.object({ id: z.string(), mode: modeSchema, status: z.string(), forecast_id: z.string().nullable(), steps: z.array(z.object({ id: z.string(), time: timestamp, tool: z.string(), reason: z.string(), duration_ms: z.number().nonnegative(), status: z.enum(["succeeded", "running", "failed"]), error: z.string().nullable() })) });
export const jobSchema = z.object({ id: z.string(), status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]), progress: z.number().min(0).max(1), result_id: z.string().nullable(), error: z.string().nullable() });
export const industrialResourceSchema = z.object({ name: z.string(), fields: z.array(z.string()).min(1) });
export const industrialResponseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test"), status: z.literal("healthy"), checkedAt: timestamp, message: z.string() }),
  z.object({ action: z.literal("discover"), resources: z.array(industrialResourceSchema).min(1) }),
  z.object({ action: z.literal("enable"), enabled: z.literal(true), mode: z.enum(["history", "stream"]), startedAt: timestamp, cursor: z.string().nullable() }),
]);
export type IndustrialKind = "oracle" | "wincc" | "postgres";
export type IndustrialAction = { action: "test" | "discover" } | { action: "enable"; assetId: string; resource: string; fields: string[]; mapping: Record<string, string> };
export type IndustrialResponse = z.infer<typeof industrialResponseSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Forecast = z.infer<typeof forecastSchema>;
export type Point = z.infer<typeof pointSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type ImportReport = z.infer<typeof importReportSchema>;
export type AgentRun = z.infer<typeof agentRunSchema>;
export type Evaluation = z.infer<typeof evaluationSchema>;
export type Job = z.infer<typeof jobSchema>;
