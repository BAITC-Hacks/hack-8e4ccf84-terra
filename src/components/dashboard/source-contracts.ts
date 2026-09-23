import {z} from "zod";
import {assetSchema, connectionSchema, importReportSchema} from "./contracts";

export const sourceAssetsSchema = z.union([z.array(assetSchema), z.object({assets: z.array(z.object({
  id: z.string(), name: z.string(), time_zone: z.string().nullable(), power_unit: z.string().nullable(),
}))}).transform(({assets}) => assets.map(asset => ({id: asset.id, name: asset.name,
  timezone: asset.time_zone ?? "UNKNOWN", unit: "normalized" as const, description: asset.power_unit ?? "UNKNOWN"}))) ]);

export const sourceConnectionsSchema = z.union([z.array(connectionSchema), z.object({connections: z.array(z.object({
  id: z.string(), name: z.string(), type: z.string(), status: z.string(), enabled: z.boolean(),
  lastSuccessAt: z.string().nullable(), lastTestedAt: z.string().nullable(), lastError: z.string().nullable(),
}))}).transform(({connections}) => connections.map(item => ({id: item.id, name: item.name, type: item.type,
  status: item.lastError ? "error" as const : item.status === "healthy" ? "ready" as const : "planned" as const,
  updated_at: item.lastSuccessAt ?? item.lastTestedAt, coverage: null, error: item.lastError ? "API connection error" : null}))) ]);

export const sourceReportSchema = z.union([importReportSchema, z.object({
  id: z.string(), status: z.enum(["processing", "completed", "failed"]),
  report: z.object({read: z.number(), accepted: z.number(), rejected: z.number(), duplicates: z.number(), reasons: z.record(z.string(), z.number())}),
  errorsUrl: z.string().nullable(),
}).transform(record => ({id: record.id, status: record.status === "completed" ? "succeeded" as const : record.status === "failed" ? "failed" as const : "running" as const,
  read: record.report.read, accepted: record.report.accepted, rejected: record.report.rejected, duplicates: record.report.duplicates,
  issues: [], reasons: record.report.reasons, errorsAvailable: !!record.errorsUrl}))]);

export const weatherResultSchema = z.object({status: z.literal("healthy"), provider: z.string(),
  initializedAt: z.iso.datetime(), checkedAt: z.iso.datetime(), hours: z.number().int().positive(), fields: z.array(z.string()),
  units: z.record(z.string(), z.string()), publishedAt: z.null()});
export type WeatherResult = z.infer<typeof weatherResultSchema>;
