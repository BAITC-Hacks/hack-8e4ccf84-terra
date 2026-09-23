import {createHash} from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function fingerprint(name: string, input: unknown) {
  return createHash("sha256")
  .update(`${name}:${canonicalJson(input)}`)
  .digest("hex");
}

export function jsonResponse(value: unknown, status = 200) {
  return new Response(
      JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
      {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
  );
}
