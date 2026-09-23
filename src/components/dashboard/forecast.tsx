"use client";
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useDashboard } from "./shell";
import { Badge, dateLabel, numberLabel, ResourceNotice, useResource } from "./resource";
import { ForecastChart } from "./chart";
import { csvRows, download } from "./csv";
import { JobStatus } from "./job";

function EvaluationReport({ id }: { id: string }) {
  const { client } = useDashboard();
  const load = useCallback((signal: AbortSignal) => client.evaluation(id, signal), [client, id]);
  const resource = useResource(load); const value = resource.data;
  return <div className="report"><ResourceNotice {...resource} />{value && <><h3>Отчёт оценки · {value.id}</h3><div className="metric-grid"><div className="metric"><span>MAE · исходная шкала</span><strong>{numberLabel(value.n ? value.mae : null)}</strong></div><div className="metric"><span>RMSE · исходная шкала</span><strong>{numberLabel(value.n ? value.rmse : null)}</strong></div><div className="metric"><span>Baseline MAE · исходная шкала</span><strong>{numberLabel(value.n ? value.baseline_mae : null)}</strong></div><div className="metric"><span>Оценённые пары</span><strong>{value.n}</strong><p>Покрытие {numberLabel(value.coverage * 100, 1)}%</p></div></div>{value.exclusions.map((item, i) => <p key={i}>{item}</p>)}<p>Февральский факт используется только для оценки.</p></>}</div>;
}
function ForecastContent() {
  const { client, mode, timezone, transport } = useDashboard();
  const search = useSearchParams();
  const resource = useResource(client.forecasts); const assets = useResource(client.assets);
  const [assetId, setAssetId] = useState(""); const [version, setVersion] = useState(search.get("version") ?? "");
  const [horizon, setHorizon] = useState(48); const [showTable, setShowTable] = useState(false);
  const [actionError, setActionError] = useState(""); const [busy, setBusy] = useState(false); const [jobId, setJobId] = useState("");
  const [reportInput, setReportInput] = useState(transport === "fixture" ? "demo-evaluation" : ""); const [reportId, setReportId] = useState("");
  const [issuedAt, setIssuedAt] = useState(transport === "fixture" ? "2026-01-31T12:00" : ""); const [model, setModel] = useState(transport === "fixture" ? "baseline-demo-1" : "");
  const currentAsset = assetId || assets.data?.[0]?.id || "";
  const runs = (resource.data ?? []).filter(run => run.mode === mode && run.asset_id === currentAsset).sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  const selected = runs.find(run => run.id === version) ?? runs[0];
  const previous = selected ? runs.find(run => run.issued_at < selected.issued_at) : undefined;
  const points = selected?.points.filter(point => point.lead_hour <= horizon).sort((a, b) => a.target_time.localeCompare(b.target_time)) ?? [];
  const partial = points.length < horizon || points.some(point => point.prediction == null);
  async function exportForecast() {
    if (!selected) return; setBusy(true); setActionError("");
    try {
      const blob = transport === "api" ? await client.exportCsv(selected.id) : new Blob([csvRows([
        ["asset_id", "issued_at", "target_time", "lead_hour", "prediction", "unit", "model_version", "weather_run_id", "forecast_run_id", "status"],
        ...selected.points.map(point => [selected.asset_id, selected.issued_at, point.target_time, point.lead_hour, point.prediction, selected.unit, selected.model_version, selected.weather_run_id, selected.id, point.status]),
      ])], { type: "text/csv;charset=utf-8" });
      download(blob, `${transport === "fixture" ? "DEMO-" : ""}forecast-${selected.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Ошибка экспорта."); } finally { setBusy(false); }
  }
  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setActionError("");
    try { const result = await client.startForecast({ asset_ids: [currentAsset], issued_at: new Date(`${issuedAt}:00Z`).toISOString(), horizon_hours: horizon, mode, model_version: model.trim(), data_policy: "history_only" }, mode === "backtest"); setJobId(result.job_id); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Не удалось создать задачу."); } finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">ПРОГНОЗ / ПОЧАСОВАЯ МОЩНОСТЬ</div><h1>Прогноз выработки</h1><p>Каждый час — с источником, версией и объяснением.</p></div><button className="primary" disabled={!selected || busy} onClick={exportForecast}>↓ Экспорт CSV</button></div>
    <div className="filterbar"><label>Объект<select aria-label="Объект" value={currentAsset} onChange={e => { setAssetId(e.target.value); setVersion(""); }}><option value="" disabled>Выберите объект</option>{assets.data?.map(asset => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label><label>Выпуск / версия<select aria-label="Выпуск / версия" value={selected?.id ?? ""} onChange={e => setVersion(e.target.value)}><option value="" disabled>Нет выпусков</option>{runs.map(run => <option key={run.id} value={run.id}>{dateLabel(run.issued_at, timezone)} · {run.id}</option>)}</select></label><label>Горизонт<select aria-label="Горизонт" value={horizon} onChange={e => setHorizon(Number(e.target.value))}><option value="24">24 часа</option><option value="48">48 часов</option></select></label><button onClick={resource.reload} disabled={resource.loading}>↻ Обновить</button></div>
    <ResourceNotice {...assets} empty={assets.data?.length === 0} /><ResourceNotice {...resource} empty={!resource.loading && !runs.length} />
    {actionError && <div role="alert" className="notice danger">{actionError}</div>}
    {version && selected && selected.id !== version && <div className="notice warning">Запрошенная версия недоступна для выбранного объекта и режима. Показан последний доступный выпуск.</div>}
    {selected && <>
      {(selected.stale || resource.error) && <div className="notice warning" role="status">Устаревшие данные. Показан последний успешный прогноз от {dateLabel(selected.issued_at, timezone)} {timezone}. Свежесть нового расчёта не подтверждена.</div>}
      {partial && <div className="notice warning">Частичные данные: {points.filter(point => point.prediction != null).length} из {horizon} часов. Пропуски показаны явно.</div>}
      <section className="panel"><div className="panel-heading"><div><h2>Ожидаемая мощность</h2><p>{selected.model_version} · выпуск {dateLabel(selected.issued_at, timezone)} {timezone}</p></div><div className="segmented" aria-label="Представление прогноза"><button aria-pressed={!showTable} onClick={() => setShowTable(false)}>График</button><button aria-pressed={showTable} onClick={() => setShowTable(true)}>Таблица</button></div></div>
      {!showTable ? <ForecastChart points={points} previous={previous} timezone={timezone} /> : <div className="table-scroll"><table><caption>Почасовые значения · {timezone} · мощность в исходной шкале</caption><thead><tr><th>Целевой час</th><th>Горизонт, ч</th><th>Прогноз</th><th>Предыдущая версия</th><th>Доступный факт</th><th>Статус</th></tr></thead><tbody>{points.map(point => <tr key={point.target_time}><td>{dateLabel(point.target_time, timezone)}</td><td>+{point.lead_hour}</td><td>{numberLabel(point.prediction)}</td><td>{numberLabel(previous?.points.find(p => p.target_time === point.target_time)?.prediction)}</td><td>{numberLabel(point.actual)}</td><td><Badge status={point.status} /></td></tr>)}</tbody></table></div>}
      <div className="panel-foot">Экспорт содержит весь сохранённый горизонт ({selected.horizon_hours} ч), время UTC, единицы и идентификаторы версии.</div></section>
      <div className="two-columns"><section className="panel briefing"><div className="eyebrow">✳ БРИФИНГ</div><h2>Что стоит за прогнозом</h2><p>{selected.briefing}</p>{mode === "replay" && <div className="notice warning">Симуляция. Виртуальный выпуск: {dateLabel(selected.issued_at, timezone)} {timezone}.</div>}</section><section className="panel"><h2>Происхождение результата</h2><dl className="metadata"><dt>Версия</dt><dd>{selected.id}</dd><dt>Модель</dt><dd>{selected.model_version}</dd><dt>Погодный прогон</dt><dd>{selected.weather_run_id}</dd><dt>Снимок входов</dt><dd>{selected.input_snapshot_id}</dd><dt>Предыдущая версия</dt><dd>{previous?.id ?? "Нет данных"}</dd><dt>Единица</dt><dd>Нормализованная мощность, исходная шкала</dd></dl></section></div>
    </>}
    <section className="panel"><div className="panel-heading"><div><h2>{mode === "backtest" ? "Запуск бэктеста" : mode === "replay" ? "Расчёт в симуляции" : "Новый прогноз"}</h2><p>{transport === "fixture" ? "Демонстрация принятия задачи. Реальные расчёты не запускаются." : "Сервер проверит модель, временную шкалу и доступность входов."}</p></div></div>
      <form className="form-grid" onSubmit={start}><label>Момент выпуска (UTC)<input aria-label="Момент выпуска (UTC)" type="datetime-local" required value={issuedAt} onChange={e => setIssuedAt(e.target.value)} /></label><label>Разрешённая версия модели<input aria-label="Разрешённая версия модели" required value={model} onChange={e => setModel(e.target.value)} placeholder="Идентификатор модели" /></label><button className="primary" disabled={busy || !currentAsset || !model.trim()} type="submit">{busy ? "Отправляем…" : mode === "backtest" ? "Запустить бэктест" : "Запустить прогноз"}</button></form><p className="muted">Режим: {mode} · {horizon} ч · history_only. Февраль 2026 — только оценка; расписание бэктеста задаётся сервером.</p>
      {jobId && <JobStatus id={jobId} />}
    </section>
    <section className="panel"><h2>Отчёт бэктеста</h2><form className="inline-form" onSubmit={e => { e.preventDefault(); setReportId(reportInput.trim()); }}><label>Идентификатор оценки<input aria-label="Идентификатор оценки" required value={reportInput} onChange={e => setReportInput(e.target.value)} placeholder="evaluation_id" /></label><button disabled={!reportInput.trim()}>Открыть отчёт</button></form>{reportId && <EvaluationReport key={reportId} id={reportId} />}</section>
  </>;
}
export function ForecastPage() { return <Suspense fallback={<p role="status">Загрузка прогноза…</p>}><ForecastContent /></Suspense>; }
