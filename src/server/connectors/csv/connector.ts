import type {
  Connector,
  ConnectorBatch,
  ConnectorHealth,
  CsvImportConfig,
} from "../contracts";
import {readCsv, type CsvRecord} from "./parser";

export class CsvConnector implements Connector<CsvRecord, CsvRecord> {
  readonly capabilities = ["history", "incremental"] as const;
  private readonly parsed;

  constructor(
    bytes: Uint8Array,
    private readonly config: CsvImportConfig,
    private readonly batchSize = 500,
  ) {
    this.parsed = readCsv(bytes, config.dialect);
  }

  async testConnection(): Promise<ConnectorHealth> {
    const missing = Object.values(this.config.mapping).filter(
      (column) => !this.parsed.headers.includes(column),
    );
    return missing.length
      ? {
          status: "unavailable",
          checkedAt: new Date().toISOString(),
          message: `Mapped columns are missing: ${missing.join(", ")}`,
        }
      : {status: "healthy", checkedAt: new Date().toISOString()};
  }

  async discoverSchema() {
    return {
      columns: this.parsed.headers,
      preview: this.parsed.records.slice(0, 20).map((record) => record.raw),
    };
  }

  async fetchBatch(cursor: string | null): Promise<ConnectorBatch<CsvRecord>> {
    const offset = cursor === null ? 0 : Number.parseInt(cursor, 10);
    const records = this.parsed.records.slice(offset, offset + this.batchSize);
    const next = offset + records.length;
    await new Promise<void>((resolve) => setImmediate(resolve));
    return {
      records,
      nextCursor: next < this.parsed.records.length ? String(next) : null,
    };
  }

  normalize(record: CsvRecord) {
    return record;
  }

  health() {
    return this.testConnection();
  }
}
