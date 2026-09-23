import {and, desc, eq} from "drizzle-orm";
import {db} from "../../../db/client";
import {
  dataImports,
  importErrors,
  observations,
  rawArtifacts,
} from "../../../db/schema";
import {emptyReport} from "./memory-repository";
import type {
  ImportIssue,
  ImportRecord,
  ImportReport,
  ImportRepository,
  ObservationDraft,
  SaveRowResult,
} from "./types";

export class PostgresImportRepository implements ImportRepository {
  async findCompleted(fingerprint: string): Promise<ImportRecord | null> {
    const [row] = await db().select({
      id: dataImports.id,
      connectionId: dataImports.connectionId,
      fileName: dataImports.fileName,
      sha256: dataImports.rawSha256,
      fingerprint: dataImports.fingerprint,
      rawPath: rawArtifacts.path,
      status: dataImports.status,
      config: dataImports.config,
      report: dataImports.report,
      errorsUrl: dataImports.errorsUrl,
      createdAt: dataImports.createdAt,
      completedAt: dataImports.completedAt,
      error: dataImports.error,
    }).from(dataImports).innerJoin(rawArtifacts, eq(dataImports.rawSha256, rawArtifacts.sha256))
      .where(and(eq(dataImports.fingerprint, fingerprint), eq(dataImports.status, "completed")));
    return row as ImportRecord | null;
  }

  async start(input: Omit<ImportRecord, "status" | "report" | "errorsUrl" | "createdAt" | "completedAt" | "error">) {
    const created = await db().transaction(async (tx) => {
      await tx.insert(rawArtifacts).values({sha256: input.sha256, path: input.rawPath})
        .onConflictDoNothing({target: rawArtifacts.sha256});
      return tx.insert(dataImports).values({
        id: input.id,
        connectionId: input.connectionId,
        rawSha256: input.sha256,
        fingerprint: input.fingerprint,
        fileName: input.fileName,
        status: "processing",
        config: input.config,
        report: emptyReport(),
      }).onConflictDoNothing({target: dataImports.fingerprint}).returning({id: dataImports.id});
    });
    if (created.length) return null;
    const [existing] = await db().select({
      id: dataImports.id,
      connectionId: dataImports.connectionId,
      fileName: dataImports.fileName,
      sha256: dataImports.rawSha256,
      fingerprint: dataImports.fingerprint,
      rawPath: rawArtifacts.path,
      status: dataImports.status,
      config: dataImports.config,
      report: dataImports.report,
      errorsUrl: dataImports.errorsUrl,
      createdAt: dataImports.createdAt,
      completedAt: dataImports.completedAt,
      error: dataImports.error,
    }).from(dataImports).innerJoin(rawArtifacts, eq(dataImports.rawSha256, rawArtifacts.sha256))
      .where(eq(dataImports.fingerprint, input.fingerprint));
    return existing as ImportRecord | null;
  }

  async saveRow(importId: string, line: number, drafts: ObservationDraft[]): Promise<SaveRowResult> {
    return db().transaction(async (tx) => {
      let changed = false;
      let revisions = 0;
      for (const draft of drafts) {
        const [latest] = await tx.select().from(observations).where(and(
          eq(observations.assetId, draft.assetId),
          eq(observations.metric, draft.metric),
          eq(observations.eventTime, draft.eventTime),
        )).orderBy(desc(observations.revision)).limit(1).for("update");
        if (latest && latest.value === draft.value && latest.unit === draft.unit) continue;
        const revision = (latest?.revision ?? 0) + 1;
        await tx.insert(observations).values({
          importId,
          sourceLine: line,
          ...draft,
          revision,
        });
        if (revision > 1) revisions++;
        changed = true;
      }
      return {status: changed ? "accepted" : "duplicate", revisions};
    });
  }

  async addIssues(importId: string, issues: ImportIssue[]) {
    if (issues.length) await db().insert(importErrors).values(issues.map((issue) => ({importId, ...issue})));
  }

  async complete(importId: string, report: ImportReport, errorsUrl: string | null) {
    await db().update(dataImports).set({
      status: "completed",
      report,
      errorsUrl,
      completedAt: new Date(),
    }).where(eq(dataImports.id, importId));
  }

  async fail(importId: string, report: ImportReport, message: string) {
    await db().update(dataImports).set({
      status: "failed",
      report,
      error: message,
      completedAt: new Date(),
    }).where(eq(dataImports.id, importId));
  }

  async get(id: string): Promise<ImportRecord | null> {
    const [row] = await db().select({
      id: dataImports.id,
      connectionId: dataImports.connectionId,
      fileName: dataImports.fileName,
      sha256: dataImports.rawSha256,
      fingerprint: dataImports.fingerprint,
      rawPath: rawArtifacts.path,
      status: dataImports.status,
      config: dataImports.config,
      report: dataImports.report,
      errorsUrl: dataImports.errorsUrl,
      createdAt: dataImports.createdAt,
      completedAt: dataImports.completedAt,
      error: dataImports.error,
    }).from(dataImports).innerJoin(rawArtifacts, eq(dataImports.rawSha256, rawArtifacts.sha256))
      .where(eq(dataImports.id, id));
    return row as ImportRecord | null;
  }

  async issues(id: string): Promise<ImportIssue[]> {
    return db().select({
      line: importErrors.line,
      code: importErrors.code,
      message: importErrors.message,
      raw: importErrors.raw,
    }).from(importErrors).where(eq(importErrors.importId, id));
  }
}
