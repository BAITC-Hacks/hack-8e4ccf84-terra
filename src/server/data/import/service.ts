import {createHash, randomUUID} from "node:crypto";
import {AppError} from "../../../agent/errors";
import {fingerprint} from "../../../lib/json";
import {CsvConnector} from "../../connectors/csv/connector";
import {previewCsv} from "../../connectors/csv/parser";
import {
  csvImportConfigSchema,
  type CsvImportConfig,
  type CanonicalMetric,
} from "../../connectors/contracts";
import {emptyReport} from "./memory-repository";
import {localTimestampToUtc} from "./time";
import type {
  ArtifactStore,
  ImportIssue,
  ImportRepository,
  ObservationDraft,
} from "./types";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

function numberValue(raw: string, decimalSeparator: "." | ",") {
  const value = Number(decimalSeparator === "," ? raw.replace(",", ".") : raw);
  if (!Number.isFinite(value)) throw new AppError("invalid_number", `'${raw}' is not a number.`);
  return value;
}

function range(metric: CanonicalMetric, value: number) {
  const limits: Record<CanonicalMetric, [number, number]> = {
    wind_speed: [0, 100],
    normalized_active_power: [0, 1],
    ambient_temperature: [-100, 100],
  };
  const [min, max] = limits[metric];
  if (value < min || value > max)
    throw new AppError("out_of_range", `${metric} must be between ${min} and ${max}.`);
  return value;
}

function isFebruary2026(sourceTimestamp: string) {
  return sourceTimestamp.trim().startsWith("2026-02-");
}

function normalizeRow(record: {line: number; raw: string[]; values: Record<string, string>}, config: CsvImportConfig) {
  const sourceTimestamp = record.values[config.mapping.timestamp]?.trim();
  if (!sourceTimestamp) throw new AppError("missing_value", "Timestamp is required.");
  const eventTime = localTimestampToUtc(sourceTimestamp, config.time.timeZone);
  const availableAt = new Date(eventTime.getTime() + config.time.availabilityLagMinutes * 60_000);
  const definitions: Array<{
    metric: CanonicalMetric;
    column: string;
    unit: string;
  }> = [
    {metric: "wind_speed", column: config.mapping.windSpeed, unit: config.units.windSpeed},
    {metric: "normalized_active_power", column: config.mapping.normalizedPower, unit: config.units.normalizedPower},
    {metric: "ambient_temperature", column: config.mapping.ambientTemperature, unit: config.units.ambientTemperature},
  ];
  return definitions.map(({metric, column, unit}): ObservationDraft => {
    const raw = record.values[column]?.trim();
    if (!raw) throw new AppError("missing_value", `${column} is required.`);
    return {
      assetId: config.assetId,
      metric,
      value: range(metric, numberValue(raw, config.dialect.decimalSeparator)),
      unit,
      eventTime,
      availableAt,
      sourceTimeZone: config.time.timeZone,
      sourceTimestamp,
      dataUse: metric === "normalized_active_power" && isFebruary2026(sourceTimestamp)
        ? "evaluation_only"
        : "training",
      qualityFlags: [],
    };
  });
}

function issueFrom(error: unknown, line: number, raw: string[]): ImportIssue {
  return {
    line,
    code: error instanceof AppError ? error.code : "invalid_row",
    message: error instanceof AppError ? error.message : "Row could not be normalized.",
    raw,
  };
}

export class CsvImportService {
  constructor(
    private readonly repository: ImportRepository,
    private readonly artifacts: ArtifactStore,
    private readonly batchSize = 500,
  ) {}

  preview(bytes: Uint8Array, configInput: unknown) {
    const config = csvImportConfigSchema.parse(configInput);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES)
      throw new AppError("invalid_file_size", "CSV must be between 1 byte and 50 MiB.");
    return {requiresConfirmation: true, config, preview: previewCsv(bytes, config.dialect)};
  }

  async import(input: {
    bytes: Uint8Array;
    fileName: string;
    connectionId?: string | null;
    config: unknown;
  }) {
    const config = csvImportConfigSchema.parse(input.config);
    if (!config.confirmed) return this.preview(input.bytes, config);
    if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_FILE_BYTES)
      throw new AppError("invalid_file_size", "CSV must be between 1 byte and 50 MiB.");

    const connector = new CsvConnector(input.bytes, config, this.batchSize);
    const health = await connector.testConnection();
    if (health.status !== "healthy")
      throw new AppError("invalid_mapping", health.message ?? "CSV mapping is invalid.");

    const id = randomUUID();
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const importFingerprint = fingerprint("csv-import", {sha256, config});
    const existing = await this.repository.findCompleted(importFingerprint);
    if (existing) return existing;
    const rawPath = await this.artifacts.saveRaw(sha256, input.bytes);
    const concurrentlyCreated = await this.repository.start({
      id,
      connectionId: input.connectionId ?? null,
      fileName: input.fileName,
      sha256,
      fingerprint: importFingerprint,
      rawPath,
      config,
    });
    if (concurrentlyCreated) return concurrentlyCreated;

    const report = emptyReport();
    let cursor: string | null = null;
    try {
      do {
        const batch = await connector.fetchBatch(cursor);
        cursor = batch.nextCursor;
        const issues: ImportIssue[] = [];
        for (const record of batch.records) {
          report.read++;
          try {
            const observations = normalizeRow(record, config);
            const saved = await this.repository.saveRow(id, record.line, observations);
            if (saved.status === "duplicate") report.duplicates++;
            else {
              report.accepted++;
              report.revisions += saved.revisions;
              if (observations.some((observation) => observation.dataUse === "evaluation_only"))
                report.evaluationOnly++;
            }
          } catch (error) {
            const issue = issueFrom(error, record.line, record.raw);
            issues.push(issue);
            report.rejected++;
            report.reasons[issue.code] = (report.reasons[issue.code] ?? 0) + 1;
          }
        }
        if (issues.length) await this.repository.addIssues(id, issues);
      } while (cursor !== null);
      const errorsUrl = report.rejected ? `/api/v1/imports/${id}/errors` : null;
      await this.repository.complete(id, report, errorsUrl);
      const completed = await this.repository.get(id);
      if (!completed)
        throw new AppError("persistence_failed", "Completed import could not be loaded.");
      return completed;
    } catch (error) {
      await this.repository.fail(
        id,
        report,
        error instanceof Error ? error.message : "Import failed.",
      );
      throw error;
    }
  }
}

export function issuesCsv(issues: ImportIssue[]) {
  const escape = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
  return [
    ["line", "code", "message", "raw"].map(escape).join(","),
    ...issues.map((issue) => [
      issue.line,
      issue.code,
      issue.message,
      issue.raw.join(","),
    ].map(escape).join(",")),
  ].join("\r\n");
}
