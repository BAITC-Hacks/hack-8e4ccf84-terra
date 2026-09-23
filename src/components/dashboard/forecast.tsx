"use client";
import { usePreferences } from "../platform/preferences";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useDashboard } from "./shell";
import { Badge, ResourceNotice, useResource } from "./resource";
import { ForecastChart } from "./chart";
import { csvRows, download } from "./csv";
import { JobStatus } from "./job";
function EvaluationReport({ id }: {
    id: string;
}) {
    const { t, numberLabel } = usePreferences();
    const { client } = useDashboard();
    const load = useCallback((signal: AbortSignal) => client.evaluation(id, signal), [client, id]);
    const resource = useResource(load);
    const value = resource.data;
    return <div className="report"><ResourceNotice {...resource}/>{value && <><h3>{t("Отчёт оценки · ")}{value.id}</h3><div className="metric-grid"><div className="metric"><span>{t("MAE · исходная шкала")}</span><strong>{numberLabel(value.n ? value.mae : null)}</strong></div><div className="metric"><span>{t("RMSE · исходная шкала")}</span><strong>{numberLabel(value.n ? value.rmse : null)}</strong></div><div className="metric"><span>{t("Baseline MAE · исходная шкала")}</span><strong>{numberLabel(value.n ? value.baseline_mae : null)}</strong></div><div className="metric"><span>{t("Оценённые пары")}</span><strong>{value.n}</strong><p>{t("Покрытие ")}{numberLabel(value.coverage * 100, 1)}%</p></div></div>{value.exclusions.map((item, i) => <p key={i}>{item}</p>)}<p>{t("Февральский факт используется только для оценки.")}</p></>}</div>;
}
function ForecastContent() {
    const { t, dateLabel, numberLabel } = usePreferences();
    const { client, mode, timezone, transport } = useDashboard();
    const search = useSearchParams();
    const resource = useResource(client.forecasts);
    const assets = useResource(client.assets);
    const [assetId, setAssetId] = useState("");
    const [version, setVersion] = useState(search.get("version") ?? "");
    const [horizon, setHorizon] = useState(48);
    const [showTable, setShowTable] = useState(false);
    const [actionError, setActionError] = useState("");
    const [busy, setBusy] = useState(false);
    const [jobId, setJobId] = useState("");
    const [reportInput, setReportInput] = useState(transport === "fixture" ? "demo-evaluation" : "");
    const [reportId, setReportId] = useState("");
    const [issuedAt, setIssuedAt] = useState(transport === "fixture" ? "2026-01-31T12:00" : "");
    const [model, setModel] = useState(transport === "fixture" ? "baseline-demo-1" : "");
    const currentAsset = assetId || assets.data?.[0]?.id || "";
    const runs = (resource.data ?? []).filter(run => run.mode === mode && run.asset_id === currentAsset).sort((a, b) => b.issued_at.localeCompare(a.issued_at));
    const selected = runs.find(run => run.id === version) ?? runs[0];
    const previous = selected ? runs.find(run => run.issued_at < selected.issued_at) : undefined;
    const points = selected?.points.filter(point => point.lead_hour <= horizon).sort((a, b) => a.target_time.localeCompare(b.target_time)) ?? [];
    const partial = points.length < horizon || points.some(point => point.prediction == null);
    async function exportForecast() {
        if (!selected)
            return;
        setBusy(true);
        setActionError("");
        try {
            const blob = transport === "api" ? await client.exportCsv(selected.id) : new Blob([csvRows([
                    ["asset_id", "issued_at", "target_time", "lead_hour", "prediction", "unit", "model_version", "weather_run_id", "forecast_run_id", "status"],
                    ...selected.points.map(point => [selected.asset_id, selected.issued_at, point.target_time, point.lead_hour, point.prediction, selected.unit, selected.model_version, selected.weather_run_id, selected.id, point.status]),
                ])], { type: "text/csv;charset=utf-8" });
            download(blob, `${transport === "fixture" ? "DEMO-" : ""}forecast-${selected.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`);
        }
        catch (error) {
            setActionError(error instanceof Error ? error.message : "Ошибка экспорта.");
        }
        finally {
            setBusy(false);
        }
    }
    async function start(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setActionError("");
        try {
            const result = await client.startForecast({ asset_ids: [currentAsset], issued_at: new Date(`${issuedAt}:00Z`).toISOString(), horizon_hours: horizon, mode, model_version: model.trim(), data_policy: "history_only" }, mode === "backtest");
            setJobId(result.job_id);
        }
        catch (error) {
            setActionError(error instanceof Error ? error.message : "Не удалось создать задачу.");
        }
        finally {
            setBusy(false);
        }
    }
    return <>
    <div className="page-heading"><div><h1>{t("Прогноз выработки")}</h1></div><button className="primary" disabled={!selected || busy} onClick={exportForecast}>{t("↓ Экспорт CSV")}</button></div>
    <div className="filterbar"><label>{t("Объект")}<select aria-label={t("Объект")} value={currentAsset} onChange={e => { setAssetId(e.target.value); setVersion(""); }}><option value="" disabled>{t("Выберите объект")}</option>{assets.data?.map(asset => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label><label>{t("Выпуск / версия")}<select aria-label={t("Выпуск / версия")} value={selected?.id ?? ""} onChange={e => setVersion(e.target.value)}><option value="" disabled>{t("Нет выпусков")}</option>{runs.map(run => <option key={run.id} value={run.id}>{dateLabel(run.issued_at, timezone)} · {run.id}</option>)}</select></label><label>{t("Горизонт")}<select aria-label={t("Горизонт")} value={horizon} onChange={e => setHorizon(Number(e.target.value))}><option value="24">{t("24 часа")}</option><option value="48">{t("48 часов")}</option></select></label><button onClick={resource.reload} disabled={resource.loading}>{t("↻ Обновить")}</button></div>
    <ResourceNotice {...assets} empty={assets.data?.length === 0}/><ResourceNotice {...resource} empty={!resource.loading && !runs.length}/>
    {actionError && <div role="alert" className="notice danger">{t(actionError)}</div>}
    {version && selected && selected.id !== version && <div className="notice warning">{t("Запрошенная версия недоступна для выбранного объекта и режима. Показан последний доступный выпуск.")}</div>}
    {selected && <>
      {(selected.stale || resource.error) && <div className="notice warning" role="status">{t("Устаревшие данные. Показан последний успешный прогноз от ")}{dateLabel(selected.issued_at, timezone)} {timezone}{t(". Свежесть нового расчёта не подтверждена.")}</div>}
      {partial && <div className="notice warning">{t("Частичные данные: ")}{points.filter(point => point.prediction != null).length}{t(" из ")}{horizon}{t(" часов. Пропуски показаны явно.")}</div>}
      <section className="panel"><div className="panel-heading"><div><h2>{t("Ожидаемая мощность")}</h2><p>{selected.model_version}{t(" · выпуск ")}{dateLabel(selected.issued_at, timezone)} {timezone}</p></div><div className="segmented" aria-label={t("Представление прогноза")}><button aria-pressed={!showTable} onClick={() => setShowTable(false)}>{t("График")}</button><button aria-pressed={showTable} onClick={() => setShowTable(true)}>{t("Таблица")}</button></div></div>
      {!showTable ? <ForecastChart points={points} previous={previous} timezone={timezone}/> : <div className="table-scroll"><table><caption>{t("Почасовые значения · ")}{timezone}{t(" · мощность в исходной шкале")}</caption><thead><tr><th>{t("Целевой час")}</th><th>{t("Горизонт, ч")}</th><th>{t("Прогноз")}</th><th>{t("Предыдущая версия")}</th><th>{t("Доступный факт")}</th><th>{t("Статус")}</th></tr></thead><tbody>{points.map(point => <tr key={point.target_time}><td>{dateLabel(point.target_time, timezone)}</td><td>+{point.lead_hour}</td><td>{numberLabel(point.prediction)}</td><td>{numberLabel(previous?.points.find(p => p.target_time === point.target_time)?.prediction)}</td><td>{numberLabel(point.actual)}</td><td><Badge status={point.status}/></td></tr>)}</tbody></table></div>}
      <div className="panel-foot">{t("CSV: {hours} ч · UTC · единицы и версии.", {hours: selected.horizon_hours})}</div></section>
      <div className="two-columns"><section className="panel briefing"><h2>{t("Краткий вывод")}</h2><p>{selected.briefing}</p>{mode === "replay" && <div className="notice warning">{t("Симуляция. Виртуальный выпуск: ")}{dateLabel(selected.issued_at, timezone)} {timezone}.</div>}</section><details className="panel content-details forecast-details"><summary>{t("Детали прогноза")}</summary><dl className="metadata"><dt>{t("Версия")}</dt><dd>{selected.id}</dd><dt>{t("Модель")}</dt><dd>{selected.model_version}</dd><dt>{t("Погодный прогон")}</dt><dd>{selected.weather_run_id}</dd><dt>{t("Снимок входов")}</dt><dd>{selected.input_snapshot_id}</dd><dt>{t("Предыдущая версия")}</dt><dd>{previous?.id ?? t("Нет данных")}</dd><dt>{t("Единица")}</dt><dd>{t("Нормализованная мощность, исходная шкала")}</dd></dl></details></div>
    </>}
    <section className="panel"><div className="panel-heading"><div><h2>{mode === "backtest" ? t("Запуск бэктеста") : mode === "replay" ? t("Расчёт в симуляции") : t("Новый прогноз")}</h2><p>{transport === "fixture" ? t("Демо: расчёт не выполняется.") : t("Выберите время выпуска и модель.")}</p></div></div>
      <form className="form-grid" onSubmit={start}><label>{t("Момент выпуска (UTC)")}<input aria-label={t("Момент выпуска (UTC)")} type="datetime-local" required value={issuedAt} onChange={e => setIssuedAt(e.target.value)}/></label><label>{t("Разрешённая версия модели")}<input aria-label={t("Разрешённая версия модели")} required value={model} onChange={e => setModel(e.target.value)} placeholder={t("Идентификатор модели")}/></label><button className="primary" disabled={busy || !currentAsset || !model.trim()} type="submit">{busy ? t("Отправляем…") : mode === "backtest" ? t("Запустить бэктест") : t("Запустить прогноз")}</button></form><p className="muted">{t("Режим: ")}{mode} · {horizon}{t(" ч · history_only. Февраль 2026 — только оценка; расписание бэктеста задаётся сервером.")}</p>
      {jobId && <JobStatus id={jobId}/>}
    </section>
    <section className="panel"><h2>{t("Отчёт бэктеста")}</h2><form className="inline-form" onSubmit={e => { e.preventDefault(); setReportId(reportInput.trim()); }}><label>{t("Идентификатор оценки")}<input aria-label={t("Идентификатор оценки")} required value={reportInput} onChange={e => setReportInput(e.target.value)} placeholder="evaluation_id"/></label><button disabled={!reportInput.trim()}>{t("Открыть отчёт")}</button></form>{reportId && <EvaluationReport key={reportId} id={reportId}/>}</section>
  </>;
}
export function ForecastPage() { const { t } = usePreferences(); return <Suspense fallback={<p role="status">{t("Загрузка прогноза…")}</p>}><ForecastContent /></Suspense>; }
