// Small RFC-4180 preview parser. Full import validation remains server-side.
export function parseCsv(text: string, delimiter = ",", maxRows = 6): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false; let closed = false;
  const input = text.replace(/^\uFEFF/, "");
  const endField = () => { row.push(field); field = ""; closed = false; };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) { if (char === '"') { if (input[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += char; continue; }
    if (char === delimiter) endField();
    else if (char === "\n" || char === "\r") { endField(); if (row.some(value => value !== "")) rows.push(row); row = []; if (char === "\r" && input[i + 1] === "\n") i++; if (rows.length >= maxRows) return rows; }
    else if (char === '"' && !field && !closed) quoted = true;
    else { if (closed || char === '"') throw new Error("Некорректные кавычки в CSV."); field += char; }
  }
  if (quoted) throw new Error("Незакрытые кавычки в CSV. Проверьте файл или уменьшите длину строки.");
  if (field || row.length) { endField(); rows.push(row); }
  return rows;
}
export function validateMapping(headers: string[], mapping: Record<string, string>): string | null {
  if (!headers.length || headers.some(header => !header.trim()) || new Set(headers).size !== headers.length) return "Заголовки должны быть непустыми и уникальными.";
  const values = Object.values(mapping);
  if (values.length !== 4 || values.some(value => !headers.includes(value))) return "Сопоставьте все четыре обязательных поля.";
  if (new Set(values).size !== values.length) return "Каждому полю нужна отдельная колонка CSV.";
  return null;
}
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Neutralize spreadsheet formulas in string identifiers and server descriptions.
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csvRows(rows: unknown[][]) { return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n"); }
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
