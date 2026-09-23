import {AppError} from "../../../agent/errors";
import type {CsvImportConfig} from "../contracts";

export interface CsvRecord {
  line: number;
  values: Record<string, string>;
  raw: string[];
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.length === 0) quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new AppError("invalid_csv", "CSV contains an unterminated quoted field.");
  if (field.length || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows;
}

export function decodeCsv(bytes: Uint8Array, encoding: string) {
  try {
    return new TextDecoder(encoding, {fatal: true})
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    throw new AppError("invalid_encoding", `CSV is not valid ${encoding}.`);
  }
}

export function readCsv(
  bytes: Uint8Array,
  dialect: CsvImportConfig["dialect"],
): {headers: string[]; records: CsvRecord[]} {
  const rows = parseRows(decodeCsv(bytes, dialect.encoding), dialect.delimiter);
  const headers = rows.shift()?.map((value) => value.trim()) ?? [];
  if (!headers.length || headers.some((value) => !value))
    throw new AppError("invalid_csv", "CSV must have a non-empty header row.");
  if (new Set(headers).size !== headers.length)
    throw new AppError("invalid_csv", "CSV header names must be unique.");

  return {
    headers,
    records: rows
      .filter((row) => row.some((value) => value.trim() !== ""))
      .map((raw, index) => ({
        line: index + 2,
        raw,
        values: Object.fromEntries(headers.map((header, column) => [header, raw[column] ?? ""])),
      })),
  };
}

export function previewCsv(
  bytes: Uint8Array,
  dialect: CsvImportConfig["dialect"],
  limit = 20,
) {
  const parsed = readCsv(bytes, dialect);
  return {
    headers: parsed.headers,
    rows: parsed.records.slice(0, limit).map((record) => record.values),
    totalRows: parsed.records.length,
    truncated: parsed.records.length > limit,
  };
}
