import { z } from "zod";

const instant = z.string().refine((value) => {
  const time = Date.parse(value);
  return Number.isFinite(time) && time % 3_600_000 === 0 && new Date(time).toISOString() === value;
}, "Expected canonical UTC whole hour");

export const triggerConfigSchema = z.object({
  assetIds: z.array(z.uuid()).min(1).refine((ids) => new Set(ids).size === ids.length),
  modelVersionId: z.uuid(),
  configVersion: z.string().min(1),
  mode: z.enum(["live", "replay", "backtest"]),
  timezone: z.string().min(1).refine((zone) => {
    if (/^[+-]/.test(zone)) return false;
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
  }, "Expected explicit IANA timezone"),
  issueHours: z.array(z.number().int().min(0).max(23)).min(1)
    .refine((hours) => new Set(hours).size === hours.length),
  startAt: instant,
  endAt: instant.optional(),
  horizons: z.array(z.union([z.literal(24), z.literal(48)])).min(1)
    .refine((hours) => new Set(hours).size === hours.length),
  pollMs: z.number().int().min(100).max(3_600_000).default(30_000),
  dispatchBatch: z.number().int().min(1).max(1000).default(100),
  maxAttempts: z.number().int().min(1).max(20).default(3),
}).strict().refine((value) => !value.endAt || value.endAt >= value.startAt, "Invalid issue range");

export type TriggerConfig = z.infer<typeof triggerConfigSchema>;

/** Explicit UTC instants avoid OS timezone and ambiguous DST wall-clock conversion.
 * Fall-back repeats both UTC hours; spring-forward has no nonexistent local issue.
 */
export function* scheduledIssues(config: TriggerConfig, now: string): Generator<string> {
  const stop = Math.min(Date.parse(now), Date.parse(config.endAt ?? now));
  if (!Number.isFinite(stop)) throw new Error("INVALID_CLOCK");
  const calendar = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let time = Date.parse(config.startAt); time <= stop; time += 3_600_000) {
    const parts = calendar.formatToParts(time);
    // Existing targetHours contract only permits whole UTC hours. Never silently shift a release.
    if (parts.find((part) => part.type === "minute")!.value !== "00") {
      throw new Error("TIMEZONE_REQUIRES_NON_WHOLE_UTC_ISSUE");
    }
    if (config.issueHours.includes(Number(parts.find((part) => part.type === "hour")!.value))) {
      yield new Date(time).toISOString();
    }
  }
}
