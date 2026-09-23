import type { AgentRun, Asset, Connection, Evaluation, Forecast, ImportReport, Mode, Scenario } from "./contracts";
export const assets: Asset[] = [{ id: "demo-line", name: "Демо · ряд мощности", timezone: "UTC", unit: "normalized", description: "Демонстрационный объект. Гранулярность и исходная зона требуют подтверждения S00." }];
export function forecasts(mode: Mode, scenario: Scenario): Forecast[] {
  if (scenario === "empty") return [];
  return [2, 1].map(version => ({
    id: `demo-${mode}-v${version}`, asset_id: "demo-line", mode, issued_at: version === 2 ? "2026-01-31T12:00:00Z" : "2026-01-31T06:00:00Z", horizon_hours: 48,
    model_version: "baseline-demo-1", weather_run_id: `weather-demo-${version}`, input_snapshot_id: `snapshot-demo-${version}`, unit: "normalized", stale: scenario === "stale",
    briefing: "Пример брифинга: после обновления погодного прогона ожидаемая мощность выросла во второй половине горизонта. Значения синтетические; качество модели и доступность архивной погоды этим примером не подтверждаются.",
    points: Array.from({ length: 48 }, (_, i) => ({ target_time: new Date(Date.UTC(2026, 0, 31, version === 2 ? 13 + i : 7 + i)).toISOString(), lead_hour: i + 1,
      prediction: scenario === "partial" && i > 35 ? null : Number((0.47 + Math.sin(i / 6) * 0.19 + Math.cos(i / 2.8) * 0.055 + version * 0.02).toFixed(3)),
      actual: mode === "backtest" && i < 16 ? Number((0.51 + Math.sin(i / 6) * 0.16).toFixed(3)) : null,
      status: scenario === "partial" && i > 35 ? "missing" : "ready",
    })),
  }));
}
export const connections: Connection[] = [
  { id: "demo-csv", name: "История измерений · CSV", type: "CSV", status: "ready", updated_at: "2026-01-31T11:40:00Z", coverage: 0.972, error: null },
  { id: "demo-weather", name: "Архивные прогоны погоды", type: "Weather API", status: "stale", updated_at: "2026-01-31T06:00:00Z", coverage: 0.91, error: "Пример: ожидается новый допустимый прогон. Подключение не проверено." },
  { id: "planned-postgres", name: "PostgreSQL", type: "Database", status: "planned", updated_at: null, coverage: null, error: null },
  { id: "demo-oracle", name: "Oracle · исторические данные", type: "Database gateway", status: "ready", updated_at: "2026-01-31T11:40:00Z", coverage: 1, error: null },
  { id: "demo-wincc", name: "Siemens WinCC · текущие данные", type: "SCADA gateway", status: "ready", updated_at: "2026-01-31T11:40:00Z", coverage: 1, error: null },
];

export const industrialResources = {
  oracle: [
    { name: "SCADA_HISTORY", fields: ["EVENT_TIME", "ACTIVE_POWER_NORM", "WIND_SPEED_MS", "AIR_TEMP_C"] },
    { name: "TURBINE_10MIN", fields: ["MEASURED_AT", "POWER_VALUE", "WIND_SPEED", "TEMPERATURE"] },
  ],
  wincc: [
    { name: "WINCC_TAGS", fields: ["TURBINE_01.ActivePower", "TURBINE_01.WindSpeed", "TURBINE_01.NacelleTemp", "TURBINE_01.Timestamp"] },
  ],
} as const;
export const report: ImportReport = { id: "demo-import", status: "succeeded", read: 144, accepted: 140, rejected: 2, duplicates: 2, issues: [{ row: 18, reason: "Пример: отсутствует скорость ветра" }, { row: 73, reason: "Пример: неверный формат времени" }] };
export const evaluation: Evaluation = { id: "demo-evaluation", n: 16, coverage: 16 / 48, mae: 0.048, rmse: 0.059, baseline_mae: 0.061, exclusions: ["32 часа без доступного факта. Все метрики демонстрационные."] };
export function agentRun(mode: Mode): AgentRun {
  return { id: "demo-run", mode, status: "succeeded", forecast_id: `demo-${mode}-v2`, steps: [
    { id: "1", time: "2026-01-31T12:00:00Z", tool: "fetch_weather_run", reason: "Выбран последний прогон с available_at ≤ времени выпуска.", duration_ms: 820, status: "succeeded", error: null },
    { id: "2", time: "2026-01-31T12:00:01Z", tool: "validate_inputs", reason: "Проверены временная шкала, единицы и покрытие входов.", duration_ms: 120, status: "succeeded", error: null },
    { id: "3", time: "2026-01-31T12:00:02Z", tool: "predict", reason: "Baseline рассчитан на неизменяемом снимке; предыдущая версия сохранена.", duration_ms: 430, status: "succeeded", error: null },
    { id: "4", time: "2026-01-31T12:00:03Z", tool: "explain", reason: "Брифинг составлен по шаблону. Пример работы без LLM.", duration_ms: 35, status: "succeeded", error: null },
  ] };
}
