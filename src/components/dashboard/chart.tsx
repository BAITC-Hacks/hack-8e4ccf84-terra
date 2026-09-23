"use client";
import { usePreferences } from "../platform/preferences";
import type { Forecast, Point } from "./contracts";

export function ForecastChart({ points, previous, timezone }: {
    points: Point[];
    previous?: Forecast;
    timezone: string;
}) {
    const { t, dateLabel, numberLabel } = usePreferences();
    const values = points.flatMap(point => [point.prediction, point.actual, previous?.points.find(p => p.target_time === point.target_time)?.prediction]).filter((value): value is number => value != null);
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    const times = points.map(point => Date.parse(point.target_time));
    const first = Math.min(...times);
    const last = Math.max(...times);
    const x = (index: number) => 54 + (times[index] - first) / Math.max(1, last - first) * 846;
    const y = (value: number) => 238 - (value - min) / (max - min) * 200;
    function path(getValue: (point: Point) => number | null | undefined) {
        let pen = false;
        return points.map((point, index) => { const value = getValue(point); if (value == null) {
            pen = false;
            return "";
        } if (index > 0 && times[index] - times[index - 1] !== 3600000)
            pen = false; const command = pen ? "L" : "M"; pen = true; return `${command}${x(index).toFixed(1)},${y(value).toFixed(1)}`; }).join(" ");
    }
    return <div className="chart-wrap"><div className="chart-legend"><span><i className="legend-current"/>{t(" Прогноз")}</span><span><i className="legend-previous"/>{t(" Предыдущая версия")}</span><span><i className="legend-actual"/>{t(" Доступный факт")}</span><small>{t("Нормализованная мощность, исходная шкала")}</small></div>
    <svg viewBox="0 0 930 290" role="img" aria-label={t("Почасовой прогноз на {p0} часов. Нормализованная мощность. Время {p1}. Точные значения доступны в таблице.", { p0: points.length, p1: timezone })}>
      {[0, 1, 2, 3, 4].map(i => { const value = min + (max - min) * i / 4; return <g key={i}><line x1="54" x2="900" y1={y(value)} y2={y(value)} className="grid-line"/><text x="40" y={y(value) + 4} textAnchor="end">{numberLabel(value, 2)}</text></g>; })}
      {previous && <path d={path(point => previous.points.find(p => p.target_time === point.target_time)?.prediction)} className="series previous"/>}
      <path d={path(point => point.prediction)} className="series prediction"/>
      <path d={path(point => point.actual)} className="series actual"/>
      {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 5)) === 0).map(point => <text key={point.target_time} x={x(points.indexOf(point))} y="267" textAnchor="middle">{dateLabel(point.target_time, timezone)}</text>)}
    </svg><p className="chart-note">{t("Время: ")}{timezone}{t(". Пропуски не заменяются нулём; версии сравниваются по целевому часу.")}</p></div>;
}
