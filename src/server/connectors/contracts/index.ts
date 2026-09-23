import {z} from "zod";

export const canonicalMetricSchema = z.enum([
  "wind_speed",
  "normalized_active_power",
  "ambient_temperature",
]);
export type CanonicalMetric = z.infer<typeof canonicalMetricSchema>;

export const metricUnits = {
  wind_speed: ["m/s"],
  normalized_active_power: ["normalized"],
  ambient_temperature: ["degC"],
} as const satisfies Record<CanonicalMetric, readonly string[]>;

export const csvDialectSchema = z
  .object({
    encoding: z.enum(["utf-8", "windows-1251"]).default("utf-8"),
    delimiter: z.string().length(1).default(","),
    decimalSeparator: z.enum([".", ","]).default("."),
  })
  .refine((value) => value.delimiter !== value.decimalSeparator, {
    message: "CSV delimiter and decimal separator must differ.",
  });

export const csvMappingSchema = z.object({
  timestamp: z.string().min(1),
  windSpeed: z.string().min(1),
  normalizedPower: z.string().min(1),
  ambientTemperature: z.string().min(1),
});

export const timeConfigSchema = z.object({
  format: z.literal("yyyy-MM-dd HH:mm:ss"),
  timeZone: z.string().min(1),
  timestampMeaning: z.enum(["interval_start", "interval_end"]),
  sourceIntervalMinutes: z.number().int().positive().max(60),
  availabilityLagMinutes: z.number().int().nonnegative().max(24 * 60),
  availabilityAssumption: z.string().min(3),
});

export const unitConfigSchema = z.object({
  windSpeed: z.literal("m/s"),
  normalizedPower: z.literal("normalized"),
  ambientTemperature: z.literal("degC"),
});

export const csvImportConfigSchema = z.object({
  assetId: z.string().min(1).max(200),
  dialect: csvDialectSchema,
  mapping: csvMappingSchema,
  time: timeConfigSchema,
  units: unitConfigSchema,
  hourlyCoverageThreshold: z.number().min(0).max(1).default(1),
  confirmed: z.boolean().default(false),
});
export type CsvImportConfig = z.infer<typeof csvImportConfigSchema>;

export type ConnectorCapability =
  | "history"
  | "incremental"
  | "stream"
  | "forecast_runs";

export interface ConnectorHealth {
  status: "healthy" | "degraded" | "unavailable";
  checkedAt: string;
  message?: string;
}

export interface ConnectorBatch<T> {
  records: T[];
  nextCursor: string | null;
}

export interface Connector<TSource, TCanonical> {
  readonly capabilities: readonly ConnectorCapability[];
  testConnection(): Promise<ConnectorHealth>;
  discoverSchema(): Promise<{columns: string[]; preview: string[][]}>;
  fetchBatch(
    cursor: string | null,
    window?: {from?: Date; to?: Date},
  ): Promise<ConnectorBatch<TSource>>;
  normalize(record: TSource): TCanonical;
  health(): Promise<ConnectorHealth>;
}
