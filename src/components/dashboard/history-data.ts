import { z } from "zod";
import type { Forecast, Scenario } from "./contracts";

export const HISTORY_START = "2026-01-31";
export const HISTORY_END = "2026-02-28";
const DAY = 86_400_000;

/** Calendar days are issue days in UTC, not target hours or local display dates. */
export function historyDays(start: string, end: string): string[] {
  if (!/^2026-\d{2}-\d{2}$/.test(start) || !/^2026-\d{2}-\d{2}$/.test(end)
    || start < HISTORY_START || end > HISTORY_END || start > end) return [];
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)
    || new Date(from).toISOString().slice(0, 10) !== start
    || new Date(to).toISOString().slice(0, 10) !== end) return [];
  return Array.from({ length: (to - from) / DAY + 1 }, (_, index) => new Date(from + index * DAY).toISOString().slice(0, 10));
}

export const historyAssetsSchema = z.object({ assets: z.array(z.object({
  id: z.string(), name: z.string(), kind: z.enum(["station", "turbine", "line"]),
})) }).transform(({ assets }) => assets.filter(asset => asset.kind === "turbine"));

// The historical viewer consumes the published persistence contract, not the legacy UI proposal.
export const historyResponseSchema = z.object({ forecasts: z.array(z.object({
  id: z.string(), version: z.number().int(), status: z.enum(["published", "incomplete"]),
  request: z.object({ assetIds: z.array(z.string()), issuedAt: z.iso.datetime({ offset: true }),
    horizonHours: z.union([z.literal(24), z.literal(48)]), mode: z.enum(["live", "backtest", "replay"]),
    modelVersionId: z.string() }),
  inputSnapshotId: z.string(), snapshot: z.object({ weatherRunIds: z.array(z.string()) }),
  values: z.array(z.object({ assetId: z.string(), targetTime: z.iso.datetime({ offset: true }),
    value: z.number().finite(), unit: z.literal("normalized") })),
})) });
export type HistoryResponse = z.infer<typeof historyResponseSchema>;
export type HistoricalForecast = Forecast & { publication: "published" | "incomplete"; revision: number };

export function historicalForecasts(response: HistoryResponse, assetId: string): HistoricalForecast[] {
  return response.forecasts.filter(run => run.request.assetIds.includes(assetId) && run.request.mode !== "live")
    .map(run => ({
      id: run.id, asset_id: assetId, issued_at: run.request.issuedAt, mode: run.request.mode,
      horizon_hours: run.request.horizonHours, model_version: run.request.modelVersionId,
      weather_run_id: run.snapshot.weatherRunIds.join(", "), input_snapshot_id: run.inputSnapshotId,
      unit: "normalized", stale: false, briefing: "", publication: run.status, revision: run.version,
      points: Array.from({ length: run.request.horizonHours }, (_, index) => {
        const target = new Date(Date.parse(run.request.issuedAt) + (index + 1) * 3_600_000).toISOString();
        const value = run.status === "published" ? run.values.find(value => value.assetId === assetId && Date.parse(value.targetTime) === Date.parse(target)) : undefined;
        return { target_time: target, lead_hour: index + 1, prediction: value?.value ?? null,
          actual: null, status: value ? "ready" : "missing" };
      }),
    }));
}

export function releasesForDay(runs: HistoricalForecast[], assetId: string, horizon: number, day: string) {
  return runs.filter(run => run.asset_id === assetId && run.horizon_hours === horizon
    && new Date(run.issued_at).toISOString().slice(0, 10) === day && run.mode !== "live")
    .sort((a, b) => Date.parse(b.issued_at) - Date.parse(a.issued_at) || b.revision - a.revision || a.id.localeCompare(b.id));
}

export const historyDemoAssets = [
  { id: "demo-turbine-1", name: "Демо · турбина 1", kind: "turbine" as const },
  { id: "demo-turbine-2", name: "Демо · турбина 2", kind: "turbine" as const },
];

export function historyDemoForecasts(assetId: string, horizon: 24 | 48, scenario: Scenario): HistoricalForecast[] {
  if (scenario === "empty") return [];
  return historyDays(HISTORY_START, HISTORY_END).map((day, dayIndex) => ({
    id: `demo-history-${assetId}-${day}-${horizon}`, asset_id: assetId,
    issued_at: `${day}T00:00:00.000Z`, horizon_hours: horizon, mode: "backtest",
    model_version: "synthetic-demo", weather_run_id: "synthetic-weather", input_snapshot_id: "synthetic-inputs",
    unit: "normalized", stale: scenario === "stale", briefing: "", revision: 1,
    publication: "published",
    points: Array.from({ length: horizon }, (_, index) => ({
      target_time: new Date(Date.parse(`${day}T00:00:00Z`) + (index + 1) * 3_600_000).toISOString(),
      lead_hour: index + 1,
      prediction: scenario === "partial" && index >= 18 ? null : Number((0.45 + Math.sin((index + dayIndex) / 6) * 0.17 + (assetId.endsWith("2") ? 0.08 : 0)).toFixed(3)),
      actual: null, status: scenario === "partial" && index >= 18 ? "missing" : "ready",
    })),
  }));
}
