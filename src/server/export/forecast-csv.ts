import type {ForecastPoint} from "../backtest/types";

export const FORECAST_CSV_COLUMNS = [
  "asset_id",
  "issued_at",
  "target_time",
  "lead_hour",
  "prediction",
  "unit",
  "model_version",
  "weather_run_id",
  "forecast_run_id",
  "status",
] as const;

export function exportForecastCsv(points: ForecastPoint[]): string {
  const rows = [...points]
    .sort((a, b) => a.assetId.localeCompare(b.assetId)
      || a.issuedAt.localeCompare(b.issuedAt)
      || a.targetTime.localeCompare(b.targetTime)
      || a.leadHour - b.leadHour)
    .map((point) => [
      point.assetId,
      point.issuedAt,
      point.targetTime,
      point.leadHour,
      point.prediction,
      point.unit,
      point.modelVersion,
      point.weatherRunId,
      point.forecastRunId,
      point.status,
    ].map(csvCell).join(","));
  return `${FORECAST_CSV_COLUMNS.join(",")}\r\n${rows.join("\r\n")}${rows.length ? "\r\n" : ""}`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
