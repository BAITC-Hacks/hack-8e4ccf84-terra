import type {CanonicalMetric, CsvImportConfig} from "../../connectors/contracts";

export type ObservationUse = "training" | "evaluation_only";

export interface ObservationDraft {
  assetId: string;
  metric: CanonicalMetric;
  value: number;
  unit: string;
  eventTime: Date;
  availableAt: Date;
  sourceTimeZone: string;
  sourceTimestamp: string;
  availabilityAssumption: string;
  dataUse: ObservationUse;
  qualityFlags: string[];
}

export interface ImportIssue {
  line: number;
  code: string;
  message: string;
  raw: string[];
}

export interface ImportReport {
  read: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  revisions: number;
  evaluationOnly: number;
  reasons: Record<string, number>;
}

export interface ImportRecord {
  id: string;
  connectionId: string | null;
  fileName: string;
  sha256: string;
  fingerprint: string;
  rawPath: string;
  status: "processing" | "completed" | "failed";
  config: CsvImportConfig;
  report: ImportReport;
  errorsUrl: string | null;
  createdAt: Date;
  completedAt: Date | null;
  error: string | null;
}

export interface SaveRowResult {
  status: "accepted" | "duplicate";
  revisions: number;
}

export interface ImportRepository {
  findCompleted(fingerprint: string): Promise<ImportRecord | null>;
  start(input: Omit<ImportRecord, "status" | "report" | "errorsUrl" | "createdAt" | "completedAt" | "error">): Promise<ImportRecord | null>;
  saveRow(importId: string, line: number, observations: ObservationDraft[]): Promise<SaveRowResult>;
  addIssues(importId: string, issues: ImportIssue[]): Promise<void>;
  complete(importId: string, report: ImportReport, errorsUrl: string | null): Promise<void>;
  fail(importId: string, report: ImportReport, message: string): Promise<void>;
  get(id: string): Promise<ImportRecord | null>;
  issues(id: string): Promise<ImportIssue[]>;
}

export interface ArtifactStore {
  saveRaw(sha256: string, bytes: Uint8Array): Promise<string>;
}
