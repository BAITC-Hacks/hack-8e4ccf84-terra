"use client";
import {useId, useRef, useState} from "react";
import { usePreferences } from "../platform/preferences";
import type { Forecast, Point } from "./contracts";

export function ForecastChart({ points, previous, timezone }: {points: Point[]; previous?: Forecast; timezone: string}) {
  const {t, dateLabel, numberLabel} = usePreferences();
  const [activeTime, setActiveTime] = useState<string>();
  const tipId = useId();
  const touchSelected = useRef(false);
  const previousByTime = new Map(previous?.points.map(point => [point.target_time, point.prediction]));
  const values = points.flatMap(point => [point.prediction, point.actual, previousByTime.get(point.target_time), ...(point.interval ?? [])]).filter((v): v is number => v != null);
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const times = points.map(point => Date.parse(point.target_time));
  const first = Math.min(...times), last = Math.max(...times);
  const x = (index: number) => 54 + (times[index] - first) / Math.max(1, last - first) * 846;
  const y = (value: number) => 238 - (value - min) / (max - min) * 200;
  const activeIndex = points.findIndex(point => point.target_time === activeTime);
  const active = points[activeIndex];
  function path(get: (point: Point) => number | null | undefined) {
    let pen = false;
    return points.map((point, index) => {
      const value = get(point);
      if (value == null) {pen = false; return "";}
      if (index > 0 && times[index] - times[index - 1] !== 3600000) pen = false;
      const command = pen ? "L" : "M"; pen = true;
      return `${command}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
    }).join(" ");
  }
  // A missing bound or hour breaks the band, just as a missing prediction breaks its line.
  const bands: number[][] = [];
  points.forEach((point, index) => {
    if (!point.interval || point.prediction == null) return;
    const segment = bands.at(-1);
    if (segment && segment.at(-1) === index - 1 && times[index] - times[index - 1] === 3600000) segment.push(index);
    else bands.push([index]);
  });
  const hasActual = points.some(point => point.actual != null);
  const lastValue = points.findLastIndex(point => point.prediction != null);
  const fmt = (value?: number | null) => value == null ? t("Нет данных") : numberLabel(value, 3);
  function hover(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left) / bounds.width * 930;
    const nearest = points.reduce((best, _, i) => Math.abs(x(i) - position) < Math.abs(x(best) - position) ? i : best, 0);
    setActiveTime(points[nearest]?.target_time);
  }
  return <div className="chart-wrap reference-chart">
    <div className="chart-legend"><span><i className="legend-current"/>{t("Прогноз")}</span>{bands.length > 0 && <span><i className="legend-band"/>{t("Диапазон")}</span>}{previous && <span><i className="legend-previous"/>{t("Предыдущая версия")}</span>}{hasActual && <span><i className="legend-actual"/>{t("Доступный факт")}</span>}<small>{t("Нормализованная мощность, исходная шкала")}</small></div>
    <div className="chart-stage">
      <svg viewBox="0 0 930 290" role="img" tabIndex={0} aria-describedby={active ? tipId : undefined}
        aria-label={t("Почасовой прогноз на {p0} часов. Нормализованная мощность. Время {p1}. Точные значения доступны в таблице.", {p0: points.length, p1: timezone})}
        onPointerMove={event => { if (!touchSelected.current) hover(event); }} onPointerDown={event => { touchSelected.current = event.pointerType === "touch"; hover(event); }} onPointerLeave={() => { if (!touchSelected.current) setActiveTime(undefined); }}
        onFocus={() => setActiveTime(points[0]?.target_time)} onBlur={() => setActiveTime(undefined)}
        onKeyDown={event => {
          if (event.key === "Escape") {setActiveTime(undefined); return;}
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const index = event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, Math.max(0, activeIndex) + (event.key === "ArrowRight" ? 1 : -1)));
          setActiveTime(points[index]?.target_time);
        }}>
        {[0,1,2,3,4].map(i => {const value = min + (max - min) * i / 4; return <g key={i}><line x1="54" x2="900" y1={y(value)} y2={y(value)} className="grid-line"/><text x="40" y={y(value) + 4} textAnchor="end">{numberLabel(value, 2)}</text></g>;})}
        {bands.filter(segment => segment.length > 1).map(segment => <polygon key={segment[0]} className="forecast-band" points={[...segment.map(i => `${x(i)},${y(points[i].interval![1])}`), ...segment.toReversed().map(i => `${x(i)},${y(points[i].interval![0])}`)].join(" ")}/>)}
        {previous && <path d={path(point => previousByTime.get(point.target_time))} className="series previous"/>}
        <path d={path(point => point.prediction)} className="series prediction"/>
        <path d={path(point => point.actual)} className="series actual"/>
        {lastValue >= 0 && <circle className="chart-end" cx={x(lastValue)} cy={y(points[lastValue].prediction!)} r="4.5"/>}
        {active && <g className="chart-selection"><line className="chart-guide" x1={x(activeIndex)} x2={x(activeIndex)} y1="28" y2="238"/>{[[active.prediction,"current"],[previousByTime.get(active.target_time),"previous"],[active.actual,"actual"]].map(([value,kind]) => typeof value === "number" && <circle key={kind} className={`chart-dot dot-${kind}`} cx={x(activeIndex)} cy={y(value)} r="4.5"/>)}</g>}
        {points.filter((_,i) => i % Math.max(1,Math.floor(points.length / 5)) === 0).map(point => <text key={point.target_time} x={x(points.indexOf(point))} y="267" textAnchor="middle">{dateLabel(point.target_time,timezone)}</text>)}
      </svg>
      {active && <div id={tipId} role="tooltip" className="chart-tooltip" style={{left:`clamp(0px, ${x(activeIndex)/930*100}% - 130px, calc(100% - 260px))`}}>
        <strong>{dateLabel(active.target_time,timezone)} · {timezone}</strong>
        <div><i className="tip-current"/><span>{t("Прогноз")}</span><b>{fmt(active.prediction)}</b></div>
        {active.interval && active.prediction != null && <div><i className="tip-band"/><span>{t("Диапазон")}</span><b>{fmt(active.interval[0])}–{fmt(active.interval[1])}</b></div>}
        {previous && <div><i className="tip-previous"/><span>{t("Предыдущая версия")}</span><b>{fmt(previousByTime.get(active.target_time))}</b></div>}
        {hasActual && <div><i className="tip-actual"/><span>{t("Доступный факт")}</span><b>{fmt(active.actual)}</b></div>}
        <small>{t("Нормализованная мощность, исходная шкала")}</small>
      </div>}
    </div>
    <p className="chart-note">{t("Наведите, коснитесь графика или используйте стрелки клавиатуры.")} {t("Время: ")}{timezone}{t(". Пропуски не заменяются нулём; версии сравниваются по целевому часу.")}</p>
  </div>;
}
