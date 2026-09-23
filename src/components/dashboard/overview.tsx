"use client";

import Link from "next/link";
import { usePreferences } from "../platform/preferences";
import { ForecastChart } from "./chart";
import { deriveOverviewMetrics, LARGE_CHANGE_THRESHOLD } from "./overview-metrics";
import { ResourceNotice, useResource } from "./resource";
import { useDashboard } from "./shell";
import type { ReactNode } from "react";

function MetricHelp({ label, children }: { label: string; children: ReactNode }) {
  return <details className="overview-metric-help">
    <summary aria-label={label}>?</summary>
    <div>{children}</div>
  </details>;
}

function MetricCard({ title, value, unit, context, secondary, attention = false, help }: {
  title: string;
  value: string;
  unit?: string;
  context: string;
  secondary: string;
  attention?: boolean;
  help: ReactNode;
}) {
  return <article className={`overview-kpi ${attention ? "attention" : ""}`}>
    <div className="overview-kpi-heading"><span>{title}</span><MetricHelp label={`${title}: ?`}>{help}</MetricHelp></div>
    <strong>{value}{unit && <em>{unit}</em>}</strong>
    <p>{context}</p>
    <small>{secondary}</small>
  </article>;
}

export function Overview() {
  const { t, dateLabel, numberLabel } = usePreferences();
  const { client, mode, timezone, transport } = useDashboard();
  const forecasts = useResource(client.forecasts);
  const sources = useResource(client.connections);
  const {
    latest,
    previous,
    points,
    peak,
    low,
    largestChange,
    largeChanges,
    normalizedIntegral,
    intervalHours,
  } = deriveOverviewMetrics(forecasts.data ?? [], mode);
  const historySource = sources.data?.find(source => source.type.toLowerCase() === "csv" && source.status === "ready");
  const staleWeather = sources.data?.find((source) => source.status === "stale");

  if (!forecasts.loading && !forecasts.error && !latest) {
    return <section className="overview-empty panel">
      <span className="overview-empty-icon" aria-hidden="true">↗</span>
      <h1>{t("Данных пока нет")}</h1>
      <p>{t("Чтобы получить первый прогноз выработки, подключите историю измерений и прогноз погоды.")}</p>
      <ol className="overview-onboarding">
        <li><b>1</b><span><strong>{t("Загрузите историю измерений")}</strong><small>{t("CSV с почасовой мощностью, от 30 дней")}</small></span><Link className="button primary" href="/sources">{t("Загрузить CSV")}</Link></li>
        <li><b>2</b><span><strong>{t("Подключите прогноз погоды")}</strong><small>{t("Ключ API и координаты объекта")}</small></span><Link className="button" href="/sources">{t("Настроить")}</Link></li>
        <li><b>3</b><span><strong>{t("Запустите первый прогноз")}</strong><small>{t("Станет доступно после подключения источников")}</small></span><button disabled>{t("Запустить")}</button></li>
      </ol>
    </section>;
  }

  const percent = (value?: number) => value == null ? "—" : `${numberLabel(value * 100, 0)}%`;
  const change = largestChange?.difference;
  const changeValue = change == null ? "—" : `${change > 0 ? "+" : change < 0 ? "−" : ""}${numberLabel(Math.abs(change) * 100, 0)}`;
  const isLargeChange = change != null && Math.abs(change) >= LARGE_CHANGE_THRESHOLD;

  return <div className="overview-redesign">
    <ResourceNotice {...forecasts} empty={false} />
    {forecasts.error && latest && <div className="notice warning">{t("Последний успешный прогноз сохранён. Свежесть не подтверждена.")}</div>}

    <div className="overview-title-row">
      <div>
        <h1>{t("Прогноз на {p0} часов", { p0: latest?.horizon_hours ?? 48 })}</h1>
        <div className="overview-release-summary">
          {transport === "fixture" && <span className="badge">{t("Демо")}</span>}
          <p>{latest ? `${t("Версия")} ${latest.id.split("-").at(-1)?.toUpperCase()} · ${t("выпущена")} ${dateLabel(latest.issued_at, timezone)}` : t("Загружаем актуальную версию")}</p>
          {latest && <details className="overview-release-details"><summary>{t("Подробности версии")}</summary><dl className="metadata"><dt>{t("Модель")}</dt><dd>{latest.model_version}</dd><dt>{t("Идентификатор прогноза")}</dt><dd>{latest.id}</dd><dt>{t("Объект")}</dt><dd>{latest.asset_id}</dd></dl></details>}
        </div>
      </div>
      <Link className="button primary overview-primary-action" href="/forecast">{t("Открыть подробный прогноз")} <span aria-hidden="true">→</span></Link>
    </div>

    {latest && <>
      <div className="overview-kpis" aria-label={t("Ключевые показатели прогноза")}>
        <MetricCard
          title={t("Максимальная выработка")}
          value={percent(peak?.prediction)}
          context={peak ? t("в нормализованной шкале") : t("Нет данных")}
          secondary={peak ? dateLabel(peak.target_time, timezone) : t("В доступных часах нет значения")}
          help={<p>{t("Максимум среди доступных почасовых значений прогноза. Формула нормализации не подтверждена.")}</p>}
        />
        <MetricCard
          title={t("Минимальная выработка")}
          value={percent(low?.prediction)}
          context={low ? t("в нормализованной шкале") : t("Нет данных")}
          secondary={low ? dateLabel(low.target_time, timezone) : t("В доступных часах нет значения")}
          help={<p>{t("Минимум среди доступных почасовых значений прогноза. Формула нормализации не подтверждена.")}</p>}
        />
        <MetricCard
          title={t("Наибольшее изменение")}
          value={changeValue}
          unit={change == null ? undefined : t("п.п.")}
          context={largestChange ? dateLabel(largestChange.point.target_time, timezone) : t("Нет предыдущей версии")}
          secondary={largestChange ? t("{count} часов с изменением ≥ 15 п.п.", { count: largeChanges }) : t("Нет совпадающих целевых часов")}
          attention={isLargeChange}
          help={<>
            <p>{t("Разница между новым и предыдущим прогнозом в процентных пунктах. Например: 39% → 67% = +28 п.п.")}</p>
            {largestChange && <p>{t("Для выбранных версий: {before}% → {after}% в {time}.", {
              before: numberLabel(largestChange.before * 100, 0),
              after: numberLabel(largestChange.point.prediction * 100, 0),
              time: dateLabel(largestChange.point.target_time, timezone),
            })}</p>}
            <p>{t("Версии сравниваются только для одного объекта и совпадающих целевых часов.")}</p>
          </>}
        />
        <MetricCard
          title={t("Интеграл нормализованной мощности")}
          value={normalizedIntegral == null ? "—" : numberLabel(normalizedIntegral, 1)}
          unit={normalizedIntegral == null ? undefined : t("доля·ч")}
          context={normalizedIntegral == null ? t("Нет данных") : t("Сумма прогноза × 1 час")}
          secondary={t("{count} из {total} часов с данными", { count: points.length, total: latest.horizon_hours })}
          help={<p>{t("Сумма доступных нормализованных значений мощности, умноженных на интервал {hours} ч. Формула нормализации неизвестна, поэтому показатель не является энергией или эквивалентом полной мощности.", { hours: intervalHours })}</p>}
        />
      </div>

      <div className="overview-main-grid">
        <section className="panel overview-chart-panel">
          <div className="overview-panel-heading"><div><h2>{t("Ожидаемая мощность")}</h2><p>{t("Нормализованная шкала; пропуски не заменяются нулями")}</p></div></div>
          <ForecastChart points={latest.points} previous={previous} timezone={timezone} />
        </section>

        <aside className="overview-alerts" aria-label={t("Требует внимания")}>
          <h2>{t("Требует внимания")} <span>{Number(Boolean(staleWeather)) + Number(largeChanges > 0)}</span></h2>
          {staleWeather && <article className="overview-alert warning-alert"><h3>{t("Прогноз погоды устарел")}</h3><p>{staleWeather.error || t("Свежесть погодных данных ниже ожидаемой. Точность прогноза может быть ниже.")}</p><Link href="/sources">{t("Проверить источник")}</Link></article>}
          {largeChanges > 0 && <article className="overview-alert warning-alert"><h3>{t("Прогноз сильно изменился")}</h3><p>{largestChange ? `${t("Максимальное изменение")} ${numberLabel(Math.abs(largestChange.difference) * 100, 0)} ${t("п.п. в")} ${dateLabel(largestChange.point.target_time, timezone)}.` : ""}</p><div><Link href="/agent-log">{t("Почему? Открыть журнал")}</Link><Link href="/forecast">{t("Сравнить версии")}</Link></div></article>}
          {!sources.loading && !sources.error && historySource && <article className="overview-alert success-alert"><h3>{t("История измерений в порядке")}</h3><p>{historySource.coverage != null ? `${t("Покрытие")} ${numberLabel((sources.data?.find((source) => source.status === "ready")?.coverage ?? 0) * 100, 1)}%.` : t("Источник готов к расчёту.")}</p></article>}
          {sources.loading && <div className="notice loading"><span className="spinner" />{t(" Загружаем данные…")}</div>}
          {transport === "api" && sources.error && <div className="notice danger">{t(sources.error)}</div>}
        </aside>
      </div>
    </>}
  </div>;
}
