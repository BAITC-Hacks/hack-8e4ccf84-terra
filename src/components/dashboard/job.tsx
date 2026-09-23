"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePreferences } from "../platform/preferences";
import type { Job } from "./contracts";
import { Badge } from "./resource";
import { useDashboard } from "./shell";

type RequestKind = "initial" | "check" | "manual" | "poll";

type JobRequestState = {
    id: string;
    data?: Job;
    error?: string;
    loading: boolean;
    requestKind?: RequestKind;
    updatedAt?: Date;
    announcement: string;
};

export function JobStatus({ id, onResult, requestVersion = 0, onLoadingChange }: {
    id: string;
    onResult?: (id: string) => void;
    requestVersion?: number;
    onLoadingChange?: (id: string, loading: boolean) => void;
}) {
    const { t, locale } = usePreferences();
    const { client, transport } = useDashboard();
    const loader = useCallback((signal: AbortSignal): Promise<Job> => transport === "fixture"
        ? Promise.resolve({ id, status: "succeeded", progress: 1, result_id: id.includes("import") ? "demo-import" : "demo-evaluation", error: null })
        : client.job(id, signal), [client, id, transport]);
    const [state, setState] = useState<JobRequestState>({ id, loading: false, announcement: "" });
    const activeRequest = useRef<{ id: string; controller: AbortController; promise: Promise<void>; generation: number } | undefined>(undefined);
    const generation = useRef(0);

    const timeLabel = useCallback((date: Date) => new Intl.DateTimeFormat(
        locale === "en" ? "en-GB" : locale === "kk" ? "kk-KZ" : "ru-RU",
        { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" },
    ).format(date), [locale]);

    const refresh = useCallback((kind: RequestKind) => {
        const current = activeRequest.current;
        if (current?.id === id)
            return current.promise;
        current?.controller.abort();

        const controller = new AbortController();
        const requestGeneration = ++generation.current;
        setState(previous => ({
            id,
            data: previous.id === id ? previous.data : undefined,
            updatedAt: previous.id === id ? previous.updatedAt : undefined,
            loading: true,
            requestKind: kind,
            announcement: "",
        }));
        onLoadingChange?.(id, true);

        const promise = loader(controller.signal).then(data => {
            if (controller.signal.aborted || generation.current !== requestGeneration)
                return;
            const updatedAt = new Date();
            const success = t("Статус обновлён · {time}", { time: timeLabel(updatedAt) });
            setState({
                id,
                data,
                loading: false,
                updatedAt,
                announcement: kind === "poll" ? "" : success,
            });
        }).catch(error => {
            if (controller.signal.aborted || generation.current !== requestGeneration)
                return;
            const message = error instanceof Error ? error.message : t("Не удалось обновить статус. Повторите запрос.");
            setState(previous => ({
                id,
                data: previous.id === id ? previous.data : undefined,
                updatedAt: previous.id === id ? previous.updatedAt : undefined,
                loading: false,
                error: message,
                announcement: t("Не удалось обновить статус. {message}", { message }),
            }));
        }).finally(() => {
            if (activeRequest.current?.generation === requestGeneration)
                activeRequest.current = undefined;
            if (generation.current === requestGeneration)
                onLoadingChange?.(id, false);
        });
        activeRequest.current = { id, controller, promise, generation: requestGeneration };
        return promise;
    }, [id, loader, onLoadingChange, t, timeLabel]);

    useEffect(() => () => {
        generation.current += 1;
        activeRequest.current?.controller.abort();
        activeRequest.current = undefined;
    }, [id]);

    useEffect(() => {
        void refresh(requestVersion > 0 ? "check" : "initial");
    }, [id, refresh, requestVersion]);

    const current = state.id === id ? state : { id, loading: true, requestKind: "initial" as const, announcement: "" };
    const { data, error, loading, updatedAt, announcement } = current;

    useEffect(() => {
        if (!data || error || loading || !["queued", "running"].includes(data.status))
            return;
        const timer = setTimeout(() => void refresh("poll"), 2500);
        return () => clearTimeout(timer);
    }, [data, error, loading, refresh]);

    useEffect(() => {
        if (data?.status === "succeeded" && data.result_id)
            onResult?.(data.result_id);
    }, [data, onResult]);

    const manualLoading = loading && current.requestKind === "manual";
    const updatedLabel = updatedAt ? t("Статус обновлён · {time}", { time: timeLabel(updatedAt) }) : "";
    return <div className="job-box">
        <div className="inline-heading"><h3>{t("Задача ")}<code>{id}</code></h3>{data && <Badge status={data.status}/>}</div>
        {data && <><progress max="1" value={data.progress} aria-label={t("Прогресс задачи")}/><p>{Math.round(data.progress * 100)}%{data.result_id && t(" · Результат: {p0}", { p0: data.result_id })}</p>{data.error && <p role="alert" className="error-text">{t("Расчёт завершился с ошибкой. Последний успешный прогноз остаётся доступен.")}</p>}</>}
        <div className="job-actions">
            <button className="job-action-button" type="button" onClick={() => void refresh("manual")} disabled={loading} aria-busy={manualLoading}>
                {manualLoading && <span className="spinner" aria-hidden="true"/>}
                {t(manualLoading ? "Обновляем…" : "Обновить статус")}
            </button>
            {updatedLabel && <span className="job-updated">{updatedLabel}</span>}
        </div>
        {error && <div className="job-error" role="alert"><span>{t("Не удалось обновить статус. {message}", { message: error })}</span><button type="button" onClick={() => void refresh("manual")} disabled={loading}>{t("Повторить")}</button></div>}
        <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </div>;
}
