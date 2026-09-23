"use client";
import { usePreferences } from "../platform/preferences";

import { useCallback, useEffect } from "react";
import type { Job } from "./contracts";
import { useDashboard } from "./shell";
import { Badge, ResourceNotice, useResource } from "./resource";
export function JobStatus({ id, onResult }: {
    id: string;
    onResult?: (id: string) => void;
}) {
    const { t } = usePreferences();
    const { client, transport } = useDashboard();
    const loader = useCallback((signal: AbortSignal): Promise<Job> => transport === "fixture" ? Promise.resolve({ id, status: "succeeded", progress: 1, result_id: id.includes("import") ? "demo-import" : "demo-evaluation", error: null }) : client.job(id, signal), [client, id, transport]);
    const resource = useResource(loader);
    const { data, reload, loading, error } = resource;
    useEffect(() => {
        if (!data || error || loading || !["queued", "running"].includes(data.status))
            return;
        const timer = setTimeout(reload, 2500);
        return () => clearTimeout(timer);
    }, [data, error, loading, reload]);
    useEffect(() => { if (data?.status === "succeeded" && data.result_id)
        onResult?.(data.result_id); }, [data, onResult]);
    return <div className="job-box"><div className="inline-heading"><h3>{t("Задача ")}<code>{id}</code></h3>{data && <Badge status={data.status}/>}</div><ResourceNotice {...resource}/>{data && <><progress max="1" value={data.progress} aria-label={t("Прогресс задачи")}/><p>{Math.round(data.progress * 100)}%{data.result_id && t(" · Результат: {p0}", { p0: data.result_id })}</p>{data.error && <p role="alert" className="error-text">{t("Расчёт завершился с ошибкой. Последний успешный прогноз остаётся доступен.")}</p>}</>}<button onClick={reload} disabled={loading}>{t("Обновить статус")}</button></div>;
}
