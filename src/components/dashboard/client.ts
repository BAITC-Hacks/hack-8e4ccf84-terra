import { z } from "zod";
import { agentRunSchema, assetSchema, connectionSchema, evaluationSchema, forecastSchema, importReportSchema, jobSchema, type Mode, type Scenario, type Transport } from "./contracts";
import * as fixture from "./fixtures";

// Only this UI adapter knows the provisional wire shape. No server modules enter the bundle.
async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(`/api/v1${path}`, { ...init, credentials: "same-origin", cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout }).catch(() => { throw new Error("Нет ответа API. Проверьте соединение и повторите запрос."); });
  if (!response.ok) {
    const descriptions: Record<number, string> = { 401: "Требуется вход в систему.", 403: "Недостаточно прав.", 404: "API или запись пока недоступны.", 409: "Конфликт запроса. Обновите данные.", 413: "Файл превышает допустимый размер.", 422: "Проверьте параметры запроса." };
    throw new Error(descriptions[response.status] ?? `Не удалось выполнить запрос (HTTP ${response.status}).`);
  }
  const body: unknown = await response.json().catch(() => { throw new Error("API вернул неверный формат данных."); });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Ответ API не соответствует ожидаемому UI-контракту. Требуется согласование с S01.");
  return parsed.data;
}

export function createClient(transport: Transport, mode: Mode, scenario: Scenario) {
  async function demo<T>(value: T, signal?: AbortSignal): Promise<T> {
    await new Promise<void>((resolve, reject) => {
      const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
      const timer = setTimeout(finish, scenario === "loading" ? 60_000 : 350);
      const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
    });
    if (scenario === "error") throw new Error("Демонстрация ошибки: источник временно недоступен. Повторите загрузку.");
    return value;
  }
  return {
    assets: (signal?: AbortSignal) => transport === "fixture" ? demo(scenario === "empty" ? [] : fixture.assets, signal) : request("/assets", z.array(assetSchema), signal),
    forecasts: (signal?: AbortSignal) => transport === "fixture" ? demo(fixture.forecasts(mode, scenario), signal) : request(`/forecasts?mode=${mode}`, z.array(forecastSchema), signal),
    connections: (signal?: AbortSignal) => transport === "fixture" ? demo(scenario === "empty" ? [] : fixture.connections, signal) : request("/connections", z.array(connectionSchema), signal),
    agentRun: (id: string, signal?: AbortSignal) => transport === "fixture" ? demo(fixture.agentRun(mode), signal) : request(`/agent-runs/${encodeURIComponent(id)}`, agentRunSchema, signal),
    importReport: (id: string, signal?: AbortSignal) => transport === "fixture" ? demo(fixture.report, signal) : request(`/imports/${encodeURIComponent(id)}`, importReportSchema, signal),
    evaluation: (id: string, signal?: AbortSignal) => transport === "fixture" ? demo(fixture.evaluation, signal) : request(`/evaluations/${encodeURIComponent(id)}`, evaluationSchema, signal),
    job: (id: string, signal?: AbortSignal) => request(`/jobs/${encodeURIComponent(id)}`, jobSchema, signal),
    importCsv: (body: FormData) => transport === "fixture" ? demo({ job_id: "demo-import-job" }) : request("/imports", z.object({ job_id: z.string() }), undefined, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body }),
    startForecast: (body: { asset_ids: string[]; issued_at: string; horizon_hours: number; mode: Mode; model_version: string; data_policy: "history_only" }, backtest: boolean) => transport === "fixture" ? demo({ job_id: "demo-forecast-job" }) : request(backtest ? "/backtest-jobs" : "/forecast-jobs", z.object({ job_id: z.string() }), undefined, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) }),
    exportCsv: async (id: string) => {
      const response = await fetch(`/api/v1/forecasts/${encodeURIComponent(id)}/export`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => { throw new Error("Не удалось связаться с API экспорта."); });
      if (!response.ok) throw new Error(`Экспорт недоступен (HTTP ${response.status}).`);
      if (!response.headers.get("content-type")?.includes("text/csv")) throw new Error("API вернул неверный формат экспорта.");
      return response.blob();
    },
  };
}
export type DashboardClient = ReturnType<typeof createClient>;
