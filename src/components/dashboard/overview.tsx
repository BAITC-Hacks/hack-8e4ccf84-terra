"use client";

import Link from "next/link";
import { usePreferences } from "../platform/preferences";
import { ForecastChart } from "./chart";
import { ResourceNotice, useResource } from "./resource";
import { useDashboard } from "./shell";
import type { Forecast, Point } from "./contracts";

function availablePoints(forecast?: Forecast) {
  return forecast?.points.filter((point): point is Point & { prediction: number } => point.prediction != null) ?? [];
}

export function Overview() {
  const { t, dateLabel, numberLabel } = usePreferences();
  const { client, mode, timezone, transport } = useDashboard();
  const forecasts = useResource(client.forecasts);
  const sources = useResource(client.connections);
  const versions = forecasts.data
    ?.filter((item) => item.mode === mode)
    .sort((a, b) => b.issued_at.localeCompare(a.issued_at)) ?? [];
  const latest = versions[0];
  const previous = versions[1];
  const points = availablePoints(latest);
  const previousByTime = new Map(previous?.points.map((point) => [point.target_time, point.prediction]) ?? []);
  const comparisons = points.flatMap((point) => {
    const before = previousByTime.get(point.target_time);
    return before == null ? [] : [{ point, difference: point.prediction - before }];
  });
  const peak = points.reduce<(typeof points)[number] | undefined>((best, point) => !best || point.prediction > best.prediction ? point : best, undefined);
  const low = points.reduce<(typeof points)[number] | undefined>((best, point) => !best || point.prediction < best.prediction ? point : best, undefined);
  const largestChange = comparisons.reduce<(typeof comparisons)[number] | undefined>((best, item) => !best || Math.abs(item.difference) > Math.abs(best.difference) ? item : best, undefined);
  const largeChanges = comparisons.filter((item) => Math.abs(item.difference) >= 0.15).length;
  const normalizedEnergy = points.reduce((sum, point) => sum + point.prediction, 0);
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

  return <div className="overview-redesign">
    <ResourceNotice {...forecasts} empty={false} />
    {forecasts.error && latest && <div className="notice warning">{t("Последний успешный прогноз сохранён. Свежесть не подтверждена.")}</div>}

    <div className="overview-title-row">
      <div>
        <h1>{t("Прогноз на {p0} часов", { p0: latest?.horizon_hours ?? 48 })}</h1>
        <p>{latest ? `${t("Версия")} ${latest.id.split("-").at(-1)?.toUpperCase()} · ${t("выпущена")} ${dateLabel(latest.issued_at, timezone)} · ${latest.model_version}` : t("Загружаем актуальную версию")}</p>
      </div>
      <Link className="button primary overview-primary-action" href="/forecast">{t("Открыть подробный прогноз")} <span aria-hidden="true">→</span></Link>
    </div>

    {latest && <>
      <div className="overview-kpis" aria-label={t("Ключевые показатели прогноза")}>
        <article className="overview-kpi"><span>{t("Пик выработки")}</span><strong>{percent(peak?.prediction)}</strong><small>{peak ? `${dateLabel(peak.target_time, timezone)} · ${t("от номинала")}` : t("Нет данных")}</small></article>
        <article className="overview-kpi"><span>{t("Минимум")}</span><strong>{percent(low?.prediction)}</strong><small>{low ? `${dateLabel(low.target_time, timezone)} · ${t("от номинала")}` : t("Нет данных")}</small></article>
        <article className={`overview-kpi ${change != null && Math.abs(change) >= .15 ? "attention" : ""}`}><span>{t("Изменение к прошлой версии")}</span><strong>{change == null ? "—" : `${change > 0 ? "+" : "−"}${numberLabel(Math.abs(change) * 100, 0)} п.п.`}</strong><small>{largestChange ? `${dateLabel(largestChange.point.target_time, timezone)} · ${largeChanges} ${t("ч с разницей ≥15 п.п.")}` : t("Нет общей части горизонта")}</small></article>
        <article className="overview-kpi"><span>{t("Сумма за горизонт")}</span><strong>{numberLabel(normalizedEnergy, 1)}<em>{t("норм.-ч")}</em></strong><small>{t("Нормализованная энергия; номинал объекта не задан")}</small></article>
      </div>

      <div className="overview-main-grid">
        <section className="panel overview-chart-panel">
          <div className="overview-panel-heading"><div><h2>{t("Ожидаемая мощность")}</h2><p>{t("Доля номинальной мощности; пропуски не заменяются нулями")}</p></div></div>
          <ForecastChart points={latest.points} previous={previous} timezone={timezone} />
        </section>

        <aside className="overview-alerts" aria-label={t("Требует внимания")}>
          <h2>{t("Требует внимания")} <span>{Number(Boolean(staleWeather)) + Number(largeChanges > 0)}</span></h2>
          {staleWeather && <article className="overview-alert warning-alert"><h3>{t("Прогноз погоды устарел")}</h3><p>{staleWeather.error || t("Свежесть погодных данных ниже ожидаемой. Точность прогноза может быть ниже.")}</p><Link href="/sources">{t("Проверить источник")}</Link></article>}
          {largeChanges > 0 && <article className="overview-alert warning-alert"><h3>{t("Прогноз сильно изменился")}</h3><p>{largestChange ? `${t("Максимальное изменение")} ${numberLabel(Math.abs(largestChange.difference) * 100, 0)} ${t("п.п. в")} ${dateLabel(largestChange.point.target_time, timezone)}.` : ""}</p><div><Link href="/agent-log">{t("Почему? Открыть журнал")}</Link><Link href="/forecast">{t("Сравнить версии")}</Link></div></article>}
          {!sources.loading && !sources.error && <article className="overview-alert success-alert"><h3>{t("История измерений в порядке")}</h3><p>{sources.data?.find((source) => source.status === "ready")?.coverage != null ? `${t("Покрытие")} ${numberLabel((sources.data?.find((source) => source.status === "ready")?.coverage ?? 0) * 100, 1)}%.` : t("Источник готов к расчёту.")}</p></article>}
          {sources.loading && <div className="notice loading"><span className="spinner" />{t(" Загружаем данные…")}</div>}
          {transport === "api" && sources.error && <div className="notice danger">{t(sources.error)}</div>}
        </aside>
      </div>
    </>}
  </div>;
}
