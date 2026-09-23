import type {
  ImportIssue,
  ImportRecord,
  ImportReport,
  ImportRepository,
  ObservationDraft,
  SaveRowResult,
} from "./types";

export class MemoryImportRepository implements ImportRepository {
  readonly imports = new Map<string, ImportRecord>();
  readonly observations = new Map<string, Array<ObservationDraft & {revision: number; importId: string}>>();
  readonly importIssues = new Map<string, ImportIssue[]>();

  async findCompleted(fingerprint: string) {
    return [...this.imports.values()].find(
      (item) => item.fingerprint === fingerprint && item.status === "completed",
    ) ?? null;
  }

  async start(input: Omit<ImportRecord, "status" | "report" | "errorsUrl" | "createdAt" | "completedAt" | "error">) {
    const existing = [...this.imports.values()].find((item) => item.fingerprint === input.fingerprint);
    if (existing) return existing;
    this.imports.set(input.id, {
      ...input,
      status: "processing",
      report: emptyReport(),
      errorsUrl: null,
      createdAt: new Date(),
      completedAt: null,
      error: null,
    });
    return null;
  }

  async saveRow(importId: string, _line: number, observations: ObservationDraft[]): Promise<SaveRowResult> {
    let changed = false;
    let revisions = 0;
    for (const observation of observations) {
      const key = `${observation.assetId}|${observation.metric}|${observation.eventTime.toISOString()}`;
      const history = this.observations.get(key) ?? [];
      const latest = history.at(-1);
      if (latest && latest.value === observation.value && latest.unit === observation.unit) continue;
      const revision = (latest?.revision ?? 0) + 1;
      if (revision > 1) revisions++;
      history.push({...observation, revision, importId});
      this.observations.set(key, history);
      changed = true;
    }
    return {status: changed ? "accepted" : "duplicate", revisions};
  }

  async addIssues(importId: string, issues: ImportIssue[]) {
    this.importIssues.set(importId, [...(this.importIssues.get(importId) ?? []), ...issues]);
  }

  async complete(importId: string, report: ImportReport, errorsUrl: string | null) {
    const current = this.imports.get(importId);
    if (current) this.imports.set(importId, {...current, status: "completed", report, errorsUrl, completedAt: new Date()});
  }

  async fail(importId: string, report: ImportReport, message: string) {
    const current = this.imports.get(importId);
    if (current) this.imports.set(importId, {...current, status: "failed", report, error: message, completedAt: new Date()});
  }

  async get(id: string) {
    return this.imports.get(id) ?? null;
  }

  async issues(id: string) {
    return this.importIssues.get(id) ?? [];
  }
}

export function emptyReport(): ImportReport {
  return {read: 0, accepted: 0, rejected: 0, duplicates: 0, revisions: 0, evaluationOnly: 0, reasons: {}};
}
