"use client";
import Link from "next/link";
import { useDashboard } from "./shell";
import { Badge, dateLabel, numberLabel, ResourceNotice, useResource } from "./resource";
import { ForecastChart } from "./chart";

export function Overview() {
  const { client, mode, timezone, transport } = useDashboard();
  const forecasts = useResource(client.forecasts); const assets = useResource(client.assets); const sources = useResource(client.connections);
  const latest = forecasts.data?.filter(item => item.mode === mode).sort((a, b) => b.issued_at.localeCompare(a.issued_at))[0];
  const predicted = latest?.points.flatMap(point => point.prediction == null ? [] : [point.prediction]) ?? [];
  return <>
    <div className="page-heading"><div><div className="eyebrow">ВЕТРОЭЛЕКТРОСТАНЦИЯ / ОБЗОР</div><h1>Энергия завтрашнего дня</h1><p>Прогноз выработки, состояние данных и прозрачность каждого расчёта.</p></div><Link className="button primary" href="/forecast">Открыть прогноз <span>↗</span></Link></div>
    <ResourceNotice {...forecasts} empty={forecasts.data?.length === 0} />
    {forecasts.error && latest && <div className="notice warning">Последний успешный прогноз сохранён. Свежесть не подтверждена.</div>}
    <div className="metric-grid"><div className="metric"><span>Средняя мощность на горизонте</span><strong>{numberLabel(predicted.length ? predicted.reduce((a, b) => a + b, 0) / predicted.length : null)}<small>исх. шкала</small></strong><p>Нормализованная · не энергия</p></div><div className="metric"><span>Горизонт прогноза</span><strong>{latest?.horizon_hours ?? "—"}<small>часов</small></strong><p>Почасовая детализация</p></div><div className="metric"><span>Последний выпуск</span><strong className="metric-date">{latest ? dateLabel(latest.issued_at, timezone) : "Нет данных"}</strong><p>{timezone} · {latest?.stale ? "Устарело" : latest ? "Сохранённая версия" : "Ожидается расчёт"}</p></div><div className="metric"><span>Режим работы</span><strong className="metric-date">{mode === "replay" ? "Симуляция" : mode === "backtest" ? "Бэктест" : "Live"}</strong><p>{transport === "fixture" ? "Демонстрационные значения" : "Данные API"}</p></div></div>
    {latest && <section className="panel"><div className="panel-heading"><div><h2>Ближайшие {latest.horizon_hours} часов</h2><p>Последний доступный прогноз · {latest.model_version}</p></div><Badge status={latest.stale ? "stale" : "ready"} /></div><ForecastChart points={latest.points} timezone={timezone} /></section>}
    <div className="two-columns"><section className="panel"><div className="panel-heading"><h2>Источники и качество</h2><Link href="/sources">Все источники ↗</Link></div><ResourceNotice {...sources} empty={sources.data?.length === 0} />{sources.data?.map(source => <div className="source-row" key={source.id}><span className="source-icon">▤</span><div><strong>{source.name}</strong><p>{source.updated_at ? `${dateLabel(source.updated_at, timezone)} · ${timezone}` : "Обновлений нет"} · покрытие {source.coverage == null ? "неизвестно" : `${numberLabel(source.coverage * 100, 1)}%`}</p></div><Badge status={source.status} /></div>)}</section>
    <section className="panel"><div className="panel-heading"><h2>Объект и выполнение</h2></div><ResourceNotice {...assets} empty={assets.data?.length === 0} />{assets.data?.map(asset => <div className="asset-summary" key={asset.id}><h3>{asset.name}</h3><p>{asset.description}</p><p>Исходная зона: {asset.timezone} · мощность: исходная шкала</p></div>)}<div className="notice neutral">Статус активной задачи доступен по её идентификатору. Закрытие браузера не отменяет серверный расчёт.</div><Link className="text-link" href="/agent-log">Проверить задачу и журнал →</Link></section></div>
  </>;
}
