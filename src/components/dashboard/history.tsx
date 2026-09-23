"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { usePreferences } from "../platform/preferences";
import { useDashboard } from "./shell";
import { ResourceNotice, useResource } from "./resource";
import { ForecastChart } from "./chart";
import { HISTORY_END, HISTORY_START, historyDays, releasesForDay } from "./history-data";

export function HistoryPage() {
  const { client, timezone, transport } = useDashboard();
  const { t, dateLabel, numberLabel } = usePreferences();
  const assets = useResource(client.historyAssets);
  const [assetId, setAssetId] = useState("");
  const currentAsset = assetId || assets.data?.[0]?.id || "";
  const [horizon, setHorizon] = useState<24 | 48>(48);
  const [start, setStart] = useState(HISTORY_START);
  const [end, setEnd] = useState(HISTORY_END);
  const [day, setDay] = useState(HISTORY_START);
  const [version, setVersion] = useState("");
  const [table, setTable] = useState(false);
  const load = useCallback((signal: AbortSignal) => client.historyForecasts(currentAsset, horizon, signal), [client, currentAsset, horizon]);
  const resource = useResource(load);
  const days = historyDays(start, end);
  const selectedDay = days.includes(day) ? day : days[0];
  const runs = resource.data?.runs ?? [];
  const daily = days.map(date => ({ date, releases: releasesForDay(runs, currentAsset, horizon, date) }));
  const releases = daily.find(item => item.date === selectedDay)?.releases ?? [];
  const selected = releases.find(run => run.id === version) ?? releases[0];
  const dayIndex = days.indexOf(selectedDay);
  const readyDays = daily.filter(item => item.releases.some(run => run.publication === "published" && run.points.every(point => point.prediction != null))).length;
  const pointCount = selected?.points.filter(point => point.prediction != null).length ?? 0;
  const chooseDay = (value: string) => { setDay(value); setVersion(""); };
  // Noon is intentionally not used: this label describes an issue date in UTC.
  const dayLabel = (value: string) => dateLabel(`${value}T00:00:00Z`, "UTC").replace(/,?\s*00:00$/, "");

  return <div className="history-page">
    <div className="page-heading"><div><h1>{t("История прогнозов")}</h1></div></div>
    <details className="panel content-details history-conditions"><summary>{t("О периоде и данных")}</summary><div className="history-context">
      <div><span>{t("История для обучения")}</span><strong>{t("Март 2023 — январь 2026")}</strong></div>
      <div><span>{t("Первый выпуск")}</span><strong>{t("31 января 2026")}</strong></div>
      <div><span>{t("Период оценки")}</span><strong>{t("1–28 февраля 2026")}</strong></div>
      <p>{t("Для каждого выпуска допустим только прогноз погоды, доступный к тому моменту. Фактическая погода из будущего не подходит.")}</p>
    </div></details>
    <section className="panel">
      <h2>{t("Турбина и период")}</h2>
      <div className="history-filters">
        <label>{t("Турбина")}<select aria-label={t("Турбина")} value={currentAsset} onChange={event => { setAssetId(event.target.value); setVersion(""); }} disabled={assets.loading || !assets.data?.length}><option value="" disabled>{t("Выберите турбину")}</option>{assets.data?.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
        <label>{t("Первый день (UTC)")}<input type="date" min={HISTORY_START} max={HISTORY_END} value={start} onChange={event => setStart(event.target.value)} /></label>
        <label>{t("Последний день (UTC)")}<input type="date" min={HISTORY_START} max={HISTORY_END} value={end} onChange={event => setEnd(event.target.value)} /></label>
        <label>{t("Горизонт")}<select aria-label={t("Горизонт")} value={horizon} onChange={event => { setHorizon(Number(event.target.value) as 24 | 48); setVersion(""); }}><option value={24}>{t("24 часа")}</option><option value={48}>{t("48 часов")}</option></select></label>
      </div>
      {!days.length && <p role="alert" className="error-text">{t("Выберите период с 31 января по 28 февраля 2026. Последний день не может быть раньше первого.")}</p>}
      <ResourceNotice {...assets} />
      {!assets.loading && !assets.error && !assets.data?.length && <div className="empty"><h3>{t("Турбины ещё не добавлены")}</h3><p>{t("Для просмотра нужны настроенные турбины и сохранённые исторические прогнозы.")}</p><Link className="button" href="/sources">{t("Источники данных")}</Link></div>}
      <p className="muted">{t("Дни выпуска — UTC. Часы на графике — в выбранном поясе.")}</p>
    </section>
    {currentAsset && days.length > 0 && <>
      <section className="panel">
        <div className="panel-heading"><div><h2>{t("Выпуски по дням")}</h2><p>{t("Выберите день, чтобы открыть сохранённый прогноз.")}</p></div><button onClick={resource.reload} disabled={resource.loading}>{t("Обновить выпуски")}</button></div>
        <ResourceNotice {...resource} />
        {resource.error && resource.data && <p role="status">{t("Показаны ранее загруженные выпуски. Обновление не удалось.")}</p>}
        {resource.data?.possiblyTruncated && <div className="notice warning">{t("API вернул предельное число выпусков. Список может быть неполным; отсутствие дня не доказывает отсутствие расчёта.")}</div>}
        {!resource.loading && resource.data && <>
          <p className="history-count" role="status">{t("Дней с полным прогнозом: {ready} из {total}", { ready: readyDays, total: days.length })}</p>
          <div className="history-days" aria-label={t("Дни выпуска (UTC)")}>{daily.map(({ date, releases }) => {
            const complete = releases.some(run => run.publication === "published" && run.points.every(point => point.prediction != null));
            const status = complete ? t("Есть прогноз") : releases.length ? t("Неполный выпуск") : t("Нет в загрузке");
            return <button key={date} className={complete ? "has-forecast" : ""} aria-pressed={date === selectedDay} aria-label={`${dayLabel(date)} · ${status}`} onClick={() => chooseDay(date)}><strong>{dayLabel(date)}</strong><small>{status}</small></button>;
          })}</div>
        </>}
      </section>
      <section className="panel" aria-label={t("Результат выбранного выпуска")}>
        <div className="panel-heading history-release-heading"><div><h2>{t("Почасовой прогноз")}</h2><p>{dayLabel(selectedDay)} · UTC</p></div><div className="history-step-buttons"><button disabled={dayIndex <= 0} onClick={() => chooseDay(days[dayIndex - 1])}>{t("Предыдущий день")}</button><button disabled={dayIndex >= days.length - 1} onClick={() => chooseDay(days[dayIndex + 1])}>{t("Следующий день")}</button></div></div>
        {resource.loading ? <p role="status">{t("Загружаем данные…")}</p> : selected ? <>
          <label className="history-version">{t("Выпуск / версия")}<select aria-label={t("Выпуск / версия")} value={selected.id} onChange={event => setVersion(event.target.value)}>{releases.map(run => <option key={run.id} value={run.id}>{dateLabel(run.issued_at, timezone)} · {t("Версия")} {run.revision} · {run.mode === "replay" ? t("Симуляция") : t("Бэктест")}</option>)}</select></label>

          <p>{dateLabel(selected.points[0].target_time, timezone)} — {dateLabel(selected.points.at(-1)!.target_time, timezone)} · {timezone}</p>
          {(selected.publication === "incomplete" || pointCount < horizon) && <div className="notice warning">{t("Доступно часов: {count} из {total}. Пропуски не заменяются нулями.", { count: pointCount, total: horizon })}</div>}
          {selected.stale && <div className="notice warning">{t("Устарело")}</div>}
          <div className="segmented" aria-label={t("Представление прогноза")}><button aria-pressed={!table} onClick={() => setTable(false)}>{t("График")}</button><button aria-pressed={table} onClick={() => setTable(true)}>{t("Таблица")}</button></div>
          {table ? <div className="table-scroll"><table><caption>{t("Почасовые значения · ")}{timezone}{t(" · мощность в исходной шкале")}</caption><thead><tr><th>{t("Целевой час")}</th><th>{t("Горизонт, ч")}</th><th>{t("Прогноз")}</th></tr></thead><tbody>{selected.points.map(point => <tr key={point.target_time}><td>{dateLabel(point.target_time, timezone)}</td><td>+{point.lead_hour}</td><td>{numberLabel(point.prediction)}</td></tr>)}</tbody></table></div> : <ForecastChart points={selected.points} timezone={timezone} />}
          <p className="muted">{t("Часы за пределами февраля не входят в оценку.")}</p>
        </> : !resource.error && <div className="empty"><h3>{t("За этот день нет загруженного выпуска")}</h3><p>{t("Выберите другой день или обновите список после выполнения расчёта.")}</p></div>}
      </section>
    </>}
    {transport === "api" && <p className="muted">{t("Просмотр сохранённых прогнозов. Автоматический расчёт периода пока недоступен.")}</p>}
  </div>;
}
