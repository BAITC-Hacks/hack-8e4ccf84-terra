import {createHash} from "node:crypto";
import {z} from "zod";

const evidence = <T extends z.ZodType>(value: T) => z.discriminatedUnion("status", [
  z.object({status: z.literal("UNKNOWN"), value: z.null(), source: z.string().min(1)}).strict(),
  z.object({status: z.literal("confirmed"), value, source: z.string().min(1)}).strict(),
]);
export const semanticManifestSchema = z.object({
  version: z.literal(1),
  timezone: evidence(z.string().min(1).refine(validTimezone, "Explicit IANA timezone required")),
  intervalMeaning: evidence(z.literal("hour_start_mean")),
  availabilityLagMinutes: evidence(z.number().finite().nonnegative()),
  mapping: evidence(z.array(z.object({sourceSeries: z.string().min(1), assetId: z.uuid()}).strict()).min(1)),
  coordinates: evidence(z.array(z.object({sourceSeries: z.string().min(1),
    latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180)}).strict()).min(1)),
  unit: evidence(z.literal("normalized")),
  normalization: evidence(z.string().min(1)),
}).strict();
export type SemanticManifest = z.infer<typeof semanticManifestSchema>;

export function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat("en", {timeZone: value}).format(); return !/^[+-]/.test(value); }
  catch { return false; }
}

/** Canonical JSON makes provenance and request hashes independent of object key order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

export function assertActualSemantics(manifest: SemanticManifest): void {
  for (const field of [manifest.timezone, manifest.intervalMeaning, manifest.availabilityLagMinutes,
    manifest.mapping, manifest.unit, manifest.normalization]) {
    if (field.status !== "confirmed") throw new Error("ACTUAL_SEMANTICS_UNCONFIRMED");
  }
  if (manifest.mapping.status === "confirmed") {
    const mapping = manifest.mapping.value;
    if (new Set(mapping.map((row) => row.assetId)).size !== mapping.length ||
      new Set(mapping.map((row) => row.sourceSeries)).size !== mapping.length) throw new Error("AMBIGUOUS_ASSET_MAPPING");
  }
}

/** Explicit calendar; UTC is a caller choice, never inferred from the host or CSV. */
export function februaryWindow(timezone: string): {start: string; endExclusive: string} {
  if (!validTimezone(timezone)) throw new Error("INVALID_CALENDAR_TIMEZONE");
  const formatter = new Intl.DateTimeFormat("en-CA", {timeZone: timezone, calendar: "gregory",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"});
  const midnight = (month: number) => {
    const desired = Date.UTC(2026, month - 1, 1);
    let instant = desired;
    for (let attempt = 0; attempt < 5; attempt++) {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
      const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
      if (wall === desired) return new Date(instant).toISOString();
      instant += desired - wall;
    }
    throw new Error("CALENDAR_MIDNIGHT_UNRESOLVED");
  };
  return {start: midnight(2), endExclusive: midnight(3)};
}
