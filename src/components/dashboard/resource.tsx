"use client";
import { useEffect, useState } from "react";

export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ loader: typeof loader; revision: number; data?: T; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    loader(controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ loader, revision, data });
    }).catch(error => {
      if (!controller.signal.aborted) setResult(previous => ({ loader, revision, data: previous?.loader === loader ? previous.data : undefined, error: error instanceof Error ? error.message : "Не удалось загрузить данные." }));
    });
    return () => controller.abort();
  }, [loader, revision]);
  const current = result?.loader === loader ? result : undefined;
  return { data: current?.data, error: current?.error, loading: current?.revision !== revision, reload: () => setRevision(value => value + 1) };
}

export function ResourceNotice({ loading, error, empty, reload }: { loading: boolean; error?: string; empty?: boolean; reload: () => void }) {
  if (loading) return <div className="notice loading" role="status"><span className="spinner" /> Загружаем данные…</div>;
  if (error) return <div className="notice danger" role="alert"><span>{error}</span><button onClick={reload}>Повторить</button></div>;
  if (empty) return <div className="empty" role="status"><span className="empty-icon">∅</span><h3>Пока нет данных</h3><p>Измените фильтры или загрузите источник и запустите расчёт.</p></div>;
  return null;
}

export function dateLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
export function numberLabel(value: number | null | undefined, digits = 3) { return value == null ? "Нет данных" : value.toLocaleString("ru-RU", { maximumFractionDigits: digits }); }
export const statusLabels: Record<string, string> = { ready: "Готово", stale: "Устарело", error: "Ошибка", planned: "Запланировано", succeeded: "Завершено", running: "Выполняется", queued: "В очереди", failed: "Ошибка", cancelled: "Отменено", missing: "Пропуск" };
export function Badge({ status }: { status: string }) { return <span className={`badge ${status}`}>{statusLabels[status] ?? status}</span>; }
