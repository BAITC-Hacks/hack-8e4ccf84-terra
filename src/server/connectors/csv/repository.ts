import {eq} from "drizzle-orm";
import {z} from "zod";
import {AppError} from "../../../agent/errors";
import {db} from "../../../db/client";
import {connections, fieldMappings} from "../../../db/schema";
import {csvImportConfigSchema, type CsvImportConfig} from "../contracts";

export const createConnectionSchema = z.object({
  type: z.literal("csv"),
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(false),
  config: csvImportConfigSchema,
}).refine((value) => !value.enabled || value.config.confirmed, {
  message: "A CSV connection cannot be enabled before mapping, time and units are confirmed.",
  path: ["config", "confirmed"],
});

export interface CsvConnection {
  id: string;
  type: "csv";
  name: string;
  enabled: boolean;
  status: string;
  lastTestedAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  cursor: string | null;
  config: CsvImportConfig;
}

function configFrom(row: typeof fieldMappings.$inferSelect): CsvImportConfig {
  return csvImportConfigSchema.parse({
    assetId: row.assetId,
    dialect: row.dialect,
    mapping: row.mapping,
    time: row.timeConfig,
    units: row.units,
    hourlyCoverageThreshold: row.hourlyCoverageThreshold,
    confirmed: row.confirmed,
  });
}

export class ConnectionRepository {
  async create(input: z.infer<typeof createConnectionSchema>): Promise<CsvConnection> {
    const value = createConnectionSchema.parse(input);
    return db().transaction(async (tx) => {
      const [connection] = await tx.insert(connections).values({
        type: value.type,
        name: value.name,
        enabled: value.enabled,
      }).returning();
      const [mapping] = await tx.insert(fieldMappings).values({
        connectionId: connection.id,
        assetId: value.config.assetId,
        dialect: value.config.dialect,
        mapping: value.config.mapping,
        timeConfig: value.config.time,
        units: value.config.units,
        hourlyCoverageThreshold: value.config.hourlyCoverageThreshold,
        confirmed: value.config.confirmed,
      }).returning();
      return {...connection, type: "csv", config: configFrom(mapping)};
    });
  }

  async list(): Promise<CsvConnection[]> {
    const rows = await db().select().from(connections)
      .innerJoin(fieldMappings, eq(connections.id, fieldMappings.connectionId));
    return rows.map((row) => ({
      ...row.connection,
      type: "csv" as const,
      config: configFrom(row.field_mapping),
    }));
  }

  async get(id: string): Promise<CsvConnection> {
    const [row] = await db().select().from(connections)
      .innerJoin(fieldMappings, eq(connections.id, fieldMappings.connectionId))
      .where(eq(connections.id, id));
    if (!row) throw new AppError("not_found", "Connection not found.");
    return {...row.connection, type: "csv", config: configFrom(row.field_mapping)};
  }

  async recordTest(id: string, healthy: boolean, message?: string) {
    const now = new Date();
    await db().update(connections).set({
      status: healthy ? "healthy" : "unavailable",
      lastTestedAt: now,
      lastSuccessAt: healthy ? now : undefined,
      lastError: healthy ? null : (message ?? "CSV test failed."),
      updatedAt: now,
    }).where(eq(connections.id, id));
  }
}
