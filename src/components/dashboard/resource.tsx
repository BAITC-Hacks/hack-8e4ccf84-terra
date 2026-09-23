"use client";
import { usePreferences } from "../platform/preferences";

import { useEffect, useState } from "react";
export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<{
        loader: typeof loader;
        revision: number;
        data?: T;
        error?: string;
    }>();
    useEffect(() => {
        const controller = new AbortController();
        loader(controller.signal).then(data => {
            if (!controller.signal.aborted)
                setResult({ loader, revision, data });
        }).catch(error => {
            if (!controller.signal.aborted)
                setResult(previous => ({ loader, revision, data: previous?.loader === loader ? previous.data : undefined, error: error instanceof Error ? error.message : "Не удалось загрузить данные." }));
        });
        return () => controller.abort();
    }, [loader, revision]);
    const current = result?.loader === loader ? result : undefined;
    return { data: current?.data, error: current?.error, loading: current?.revision !== revision, reload: () => setRevision(value => value + 1) };
}
export function ResourceNotice({ loading, error, empty, reload }: {
    loading: boolean;
    error?: string;
    empty?: boolean;
    reload: () => void;
}) {
    const { t } = usePreferences();
    if (loading)
        return <div className="notice loading" role="status"><span className="spinner"/>{t(" Загружаем данные…")}</div>;
    if (error)
        return <div className="notice danger" role="alert"><span>{t(error)}</span><button onClick={reload}>{t("Повторить")}</button></div>;
    if (empty)
        return <div className="empty" role="status"><span className="empty-icon">∅</span><h3>{t("Пока нет данных")}</h3><p>{t("Измените фильтры или загрузите источник и запустите расчёт.")}</p></div>;
    return null;
}
export const statusLabels: Record<string, string> = { ready: "Готово", stale: "Устарело", error: "Ошибка", planned: "Запланировано", succeeded: "Завершено", running: "Выполняется", queued: "В очереди", failed: "Ошибка", cancelled: "Отменено", missing: "Пропуск" };
export function Badge({ status }: {
    status: string;
}) { const { t } = usePreferences(); return <span className={`badge ${status}`}>{t(statusLabels[status] ?? status)}</span>; }
