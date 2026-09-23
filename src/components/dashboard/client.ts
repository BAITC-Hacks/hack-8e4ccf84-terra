import {sourceAssetsSchema, sourceConnectionsSchema, sourceReportSchema, weatherResultSchema} from "./source-contracts";
import { translate, type Locale } from "../../lib/i18n";
import { z } from "zod";
import { agentRunSchema, evaluationSchema, forecastSchema, industrialResponseSchema, jobSchema, type IndustrialAction, type IndustrialKind, type Mode, type Scenario, type Transport } from "./contracts";
import * as fixture from "./fixtures";
import { historyAssetsSchema, historyDemoAssets, historyDemoForecasts, historicalForecasts, historyResponseSchema } from "./history-data";

// Only this UI adapter knows the provisional wire shape. No server modules enter the bundle.
async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, init?: RequestInit, locale: Locale = "ru"): Promise<T> {
  const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(`/api/v1${path}`, { ...init, credentials: "same-origin", cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout }).catch(() => { throw new Error(t("Нет ответа API. Проверьте соединение и повторите запрос.")); });
  if (!response.ok) {
    const descriptions: Record<number, string> = { 401: "Требуется вход в систему.", 403: "Недостаточно прав.", 404: "API или запись пока недоступны.", 409: "Конфликт запроса. Обновите данные.", 413: "Файл превышает допустимый размер.", 422: "Проверьте параметры запроса." };
    const safeError = await response.clone().json().catch(() => null);
    if (safeError?.error?.code === "not_configured") throw new Error(t("Серверный шлюз не настроен. Обратитесь к администратору."));
    if (safeError?.error?.code === "connector_unavailable") throw new Error(t("Источник недоступен. Проверьте настройки и повторите запрос."));
    if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("terra:session-expired"));
    throw new Error(descriptions[response.status] ? t(descriptions[response.status]) : t("Не удалось выполнить запрос (HTTP {status}).", { status: response.status }));
  }
  const body: unknown = await response.json().catch(() => { throw new Error(t("API вернул неверный формат данных.")); });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error(t("Ответ API не соответствует ожидаемому UI-контракту. Требуется согласование с S01."));
  return parsed.data;
}

export function createClient(transport: Transport, mode: Mode, scenario: Scenario, locale: Locale = "ru") {
  const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
  const api = <T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, init?: RequestInit) => request(path, schema, signal, init, locale);
  // Translate only our synthetic copy; external API content retains its original language.
  function localized<T>(value: T): T {
    if (typeof value === "string") return t(value) as T;
    if (Array.isArray(value)) return value.map(localized) as T;
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localized(item)])) as T;
    return value;
  }
  async function demo<T>(value: T, signal?: AbortSignal): Promise<T> {
    await new Promise<void>((resolve, reject) => {
      const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
      const timer = setTimeout(finish, scenario === "loading" ? 60_000 : 350);
      const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
    });
    if (scenario === "error") throw new Error(t("Демонстрация ошибки: источник временно недоступен. Повторите загрузку."));
    return localized(value);
  }
  return {
    historyAssets: (signal?: AbortSignal) => transport === "fixture"
      ? demo(scenario === "empty" ? [] : historyDemoAssets, signal)
      : api("/assets", historyAssetsSchema, signal),
    historyForecasts: async (assetId: string, horizon: 24 | 48, signal?: AbortSignal) => {
      if (!assetId) return { runs: [], possiblyTruncated: false };
      if (transport === "fixture") return { runs: await demo(historyDemoForecasts(assetId, horizon, scenario), signal), possiblyTruncated: false };
      const query = `asset_id=${encodeURIComponent(assetId)}&horizon_hours=${horizon}`;
      const responses = await Promise.all(["backtest", "replay"].map(mode => api(`/forecasts?${query}&mode=${mode}`, historyResponseSchema, signal)));
      return { runs: responses.flatMap(response => historicalForecasts(response, assetId)),
        possiblyTruncated: responses.some(response => response.forecasts.length >= 100) };
    },
    assets: (signal?: AbortSignal) => transport === "fixture" ? demo(scenario === "empty" ? [] : fixture.assets, signal) : api("/assets", sourceAssetsSchema, signal),
    forecasts: (signal?: AbortSignal) => transport === "fixture" ? demo(fixture.forecasts(mode, scenario), signal) : api(`/forecasts?mode=${mode}`, z.array(forecastSchema), signal),
    connections: (signal?: AbortSignal) => transport === "fixture" ? demo(scenario === "empty" ? [] : fixture.connections, signal) : api("/connections", sourceConnectionsSchema, signal),
    agentRun: (id: string, signal?: AbortSignal) => transport === "fixture" ? demo(fixture.agentRun(mode), signal) : api(`/agent-runs/${encodeURIComponent(id)}`, agentRunSchema, signal),
    importReport: (id: string, signal?: AbortSignal) => transport === "fixture" ? demo(fixture.report, signal) : api(`/imports/${encodeURIComponent(id)}`, sourceReportSchema, signal),
    evaluation: (id: string, signal?: AbortSignal) => transport === "fixture" ? demo(fixture.evaluation, signal) : api(`/evaluations/${encodeURIComponent(id)}`, evaluationSchema, signal),
    job: (id: string, signal?: AbortSignal) => api(`/jobs/${encodeURIComponent(id)}`, jobSchema, signal),
    importCsv: (body: FormData) => transport === "fixture" ? demo({ id: "demo-import" }) : api("/imports", z.object({ id: z.string() }), undefined, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body }),
    weather: (input: {latitude: number; longitude: number; initializedAt: string}) => transport === "fixture"
      ? demo({status: "healthy" as const, provider: "Open-Meteo Single Runs", initializedAt: input.initializedAt, checkedAt: new Date().toISOString(), hours: 120, fields: ["temperature_2m", "wind_speed_10m", "wind_speed_100m", "wind_direction_100m"], units: {temperature_2m: "°C", wind_speed_10m: "m/s", wind_speed_100m: "m/s", wind_direction_100m: "°"}, publishedAt: null})
      : api("/connectors/weather", weatherResultSchema, undefined, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)}),
    industrial: (kind: IndustrialKind, action: IndustrialAction) => {
      if (transport === "fixture") {
        if (action.action === "test") return demo({ action: "test" as const, status: "healthy" as const, checkedAt: new Date().toISOString(), message: `Демо-доступ к ${kind === "oracle" ? "Oracle" : kind === "postgres" ? "PostgreSQL" : "Siemens WinCC"} подтверждён.` });
        if (action.action === "discover") return demo({ action: "discover" as const, resources: fixture.industrialResources[kind].map(resource => ({ name: resource.name, fields: [...resource.fields] })) });
        return demo({ action: "enable" as const, enabled: true as const, mode: kind !== "wincc" ? "history" as const : "stream" as const, startedAt: new Date().toISOString(), cursor: kind === "oracle" ? "history:0" : null });
      }
      return api(`/industrial-connectors/${kind}`, industrialResponseSchema, undefined, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
    },
    startForecast: (body: { asset_ids: string[]; issued_at: string; horizon_hours: number; mode: Mode; model_version: string; data_policy: "history_only" }, backtest: boolean) => transport === "fixture" ? demo({ job_id: "demo-forecast-job" }) : api(backtest ? "/backtest-jobs" : "/forecast-jobs", z.object({ job_id: z.string() }), undefined, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) }),
    exportCsv: async (id: string) => {
      const response = await fetch(`/api/v1/forecasts/${encodeURIComponent(id)}/export`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => { throw new Error(t("Не удалось связаться с API экспорта.")); });
      if (!response.ok) {
        if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("terra:session-expired"));
        throw new Error(t("Экспорт недоступен (HTTP {status}).", { status: response.status }));
      }
      if (!response.headers.get("content-type")?.includes("text/csv")) throw new Error(t("API вернул неверный формат экспорта."));
      return response.blob();
    },
  };
}
export type DashboardClient = ReturnType<typeof createClient>;
