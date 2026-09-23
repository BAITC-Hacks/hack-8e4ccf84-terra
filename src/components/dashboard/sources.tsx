"use client";
import { usePreferences } from "../platform/preferences";

import { useCallback, useMemo, useState } from "react";
import { useDashboard } from "./shell";
import { Badge, ResourceNotice, useResource } from "./resource";
import { csvRows, download, parseCsv, validateMapping } from "./csv";
import { WeatherConnector } from "./weather-connector";
import { IndustrialConnectors } from "./industrial-connectors";
const fields = [["timestamp", "Время"], ["wind_speed", "Скорость ветра · м/с"], ["power", "Нормализованная мощность · исходная шкала"], ["temperature", "Температура · °C"]];
function ImportReport({ id }: {
    id: string;
}) {
    const { t } = usePreferences();
    const { client, transport } = useDashboard();
    const loader = useCallback((signal: AbortSignal) => client.importReport(id, signal), [client, id]);
    const resource = useResource(loader);
    const report = resource.data;
    return <div className="report"><ResourceNotice {...resource}/>{report && <><div className="inline-heading"><h3>{t("Отчёт импорта · ")}{report.id}</h3><Badge status={report.status}/></div><div className="metric-grid">{[[t("Прочитано"), report.read], [t("Принято"), report.accepted], [t("Отклонено"), report.rejected], [t("Повторы"), report.duplicates]].map(([label, value]) => <div key={t(String(label))} className="metric"><span>{t(String(label))}</span><strong>{value}</strong></div>)}</div>{report.issues.length > 0 && <div className="table-scroll"><table><caption>{t("Причины отклонения строк")}</caption><thead><tr><th>{t("Строка")}</th><th>{t("Причина")}</th></tr></thead><tbody>{report.issues.map((issue, i) => <tr key={i}><td>{issue.row}</td><td>{issue.reason}</td></tr>)}</tbody></table></div>}{!report.issues.length && report.rejected === 0 && <p>{t("Ошибок строк нет.")}</p>}{transport === "api" && report.rejected > 0 && <a className="button" href={`/api/v1/imports/${encodeURIComponent(report.id)}/errors`} download>{t("↓ Скачать причины отклонения")}</a>}<button hidden={transport === "api"} disabled={!report.issues.length} onClick={() => download(new Blob([csvRows([["row", "reason"], ...report.issues.map(issue => [issue.row, issue.reason])])], { type: "text/csv;charset=utf-8" }), `${transport === "fixture" ? "DEMO-" : ""}import-errors.csv`)}>{t("↓ Скачать причины отклонения")}</button><button onClick={resource.reload} disabled={resource.loading}>{t("Обновить отчёт")}</button></>}</div>;
}
export function SourcesPage() {
    const { t, dateLabel, numberLabel } = usePreferences();
    const { client, timezone, transport } = useDashboard();
    const sources = useResource(client.connections);
    const assets = useResource(client.assets);
    const [file, setFile] = useState<File>();
    const [bytes, setBytes] = useState<ArrayBuffer>();
    const [fileError, setFileError] = useState("");
    const [reading, setReading] = useState(false);
    const [delimiter, setDelimiter] = useState(",");
    const [encoding, setEncoding] = useState("utf-8");
    const [decimal, setDecimal] = useState(".");
    const [mapping, setMapping] = useState<Record<string, string>>({ timestamp: "", wind_speed: "", power: "", temperature: "" });
    const [assetId, setAssetId] = useState("");
    const [sourceZone, setSourceZone] = useState("");
    const timeFormat = "yyyy-MM-dd HH:mm:ss";
    const [interval, setInterval] = useState(10);
    const [lag, setLag] = useState(0);
    const [assumption, setAssumption] = useState("");
    const [convention, setConvention] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [reportInput, setReportInput] = useState(transport === "fixture" ? "demo-import" : "");
    const [reportId, setReportId] = useState("");
    const preview = useMemo(() => { if (!bytes)
        return { rows: [], error: "" }; try {
        return { rows: parseCsv(new TextDecoder(encoding, { fatal: true }).decode(bytes, { stream: true }), delimiter), error: "" };
    }
    catch (error) {
        return { rows: [], error: error instanceof Error ? error.message : "Не удалось прочитать CSV." };
    } }, [bytes, delimiter, encoding]);
    const headers = preview.rows[0] ?? [];
    const mappingError = validateMapping(headers, mapping);
    const currentAsset = assetId || assets.data?.[0]?.id || "";
    async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
        setConfirmed(false);
        setBytes(undefined);
        setFile(undefined);
        setFileError("");
        setReportId("");
        const chosen = event.target.files?.[0];
        if (!chosen)
            return;
        if (!chosen.name.toLowerCase().endsWith(".csv")) {
            setFileError("Выберите файл .csv.");
            return;
        }
        if (!chosen.size || chosen.size > 50 * 1024 * 1024) {
            setFileError("Нужен непустой CSV размером до 50 МБ.");
            return;
        }
        setReading(true);
        try {
            const data = await chosen.slice(0, 256 * 1024).arrayBuffer();
            setBytes(data);
            setFile(chosen);
        }
        catch {
            setFileError("Не удалось прочитать файл.");
        }
        finally {
            setReading(false);
        }
    }
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!file || mappingError || !sourceZone || !convention || !confirmed || !currentAsset || delimiter === decimal || assumption.trim().length < 3)
            return;
        setBusy(true);
        setError("");
        try {
            const body = new FormData();
            body.append("file", file);
            body.append("config", JSON.stringify({assetId: currentAsset, dialect: {encoding, delimiter, decimalSeparator: decimal}, mapping: {timestamp: mapping.timestamp, windSpeed: mapping.wind_speed, normalizedPower: mapping.power, ambientTemperature: mapping.temperature}, time: {format: timeFormat, timeZone: sourceZone, timestampMeaning: convention, sourceIntervalMinutes: interval, availabilityLagMinutes: lag, availabilityAssumption: assumption.trim()}, units: {windSpeed: "m/s", normalizedPower: "normalized", ambientTemperature: "degC"}, hourlyCoverageThreshold: 1, confirmed: true}));
            const result = await client.importCsv(body);
            setReportId(result.id);
            sources.reload();
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "Не удалось отправить импорт.");
        }
        finally {
            setBusy(false);
        }
    }
    return <div className="connectors-page">
    <div className="page-heading"><div><div className="eyebrow">{t("ДАННЫЕ / ПРОИСХОЖДЕНИЕ И КАЧЕСТВО")}</div><h1>{t("Источники данных")}</h1><p>{t("От исходной строки до надёжного входа для прогноза.")}</p></div><a className="button primary" href="#csv-import">{t("+ Импорт CSV")}</a></div>
    <nav className="connector-catalog" aria-label={t("Коннекторы")}>{[["csv-import", "CSV", "01"], ["connector-weather", "Weather API", "02"], ["connector-postgres", "PostgreSQL / SCADA", "03"], ["connector-oracle", "Oracle", "04"], ["connector-wincc", "Siemens WinCC", "05"]].map(([id, name, index]) => <a href={`#${id}`} key={id}><span className="connector-number">{index}</span><strong>{name}</strong><span>{t("Настроить")} ↗</span></a>)}</nav>
    <ResourceNotice {...sources}/>
    <div className="source-grid">{sources.data?.map(source => <section className="panel source-card" key={source.id}><div className="inline-heading"><span className="source-icon">▤</span><Badge status={source.status}/></div><h2>{source.name}</h2><p>{source.type}</p><dl className="metadata"><dt>{t("Обновлено")}</dt><dd>{source.updated_at ? `${dateLabel(source.updated_at, timezone)} ${timezone}` : t("Нет данных")}</dd><dt>{t("Покрытие")}</dt><dd>{source.coverage == null ? t("Нет данных") : `${numberLabel(source.coverage * 100, 1)}%`}</dd></dl>{source.error && <p className="warning-text">{source.error}</p>}{source.status === "planned" && <p>{t("Подключение запланировано. Данные не поступают.")}</p>}</section>)}</div>
    <WeatherConnector client={client} transport={transport}/>
    <IndustrialConnectors client={client} assets={assets.data ?? []} transport={transport}/>
    <section id="csv-import" className="panel"><div className="panel-heading"><div><div className="eyebrow">{t("01 / ЗАГРУЗКА И СОПОСТАВЛЕНИЕ")}</div><h2>{t("Импортировать историю")}</h2><p>{t("Предпросмотр первых пяти строк. Полная валидация выполняется на сервере.")}</p></div></div>
    <ResourceNotice {...assets}/><form onSubmit={submit} onChange={() => setConfirmed(false)}>
      <fieldset disabled={busy} className="connector-fields"><div className="upload-zone"><label>{t("CSV с измерениями")}<input aria-label={t("CSV с измерениями")} type="file" accept=".csv,text/csv" onChange={chooseFile} disabled={reading || busy}/></label><p>{t("До 50 МБ · исходный файл передаётся без изменения")}</p></div>
      {reading && <p role="status">{t("Читаем файл…")}</p>}{(fileError || preview.error) && <div role="alert" className="notice danger">{t(fileError || preview.error)}</div>}
      <div className="form-grid"><label>{t("Объект")}<select aria-label={t("Объект")} required value={currentAsset} onChange={e => setAssetId(e.target.value)}><option value="" disabled>{t("Выберите объект")}</option>{assets.data?.map(asset => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label><label>{t("Кодировка")}<select aria-label={t("Кодировка")} value={encoding} onChange={e => setEncoding(e.target.value)}><option value="utf-8">UTF-8</option><option value="windows-1251">Windows-1251</option></select></label><label>{t("Разделитель")}<select aria-label={t("Разделитель")} value={delimiter} onChange={e => setDelimiter(e.target.value)}><option value=",">{t("Запятая")}</option><option value=";">{t("Точка с запятой")}</option><option value={"\t"}>{t("Табуляция")}</option></select></label><label>{t("Десятичный разделитель")}<select aria-label={t("Десятичный разделитель")} value={decimal} onChange={e => setDecimal(e.target.value)}><option value=".">{t("Точка")}</option><option value=",">{t("Запятая")}</option></select></label><label>{t("Исходный часовой пояс")}<select aria-label={t("Исходный часовой пояс")} required value={sourceZone} onChange={e => setSourceZone(e.target.value)}><option value="">{t("Нужно подтвердить")}</option><option value="UTC">UTC</option><option value="Asia/Almaty">Asia/Almaty</option><option value="Asia/Qyzylorda">Asia/Qyzylorda</option></select></label><label>{t("Формат времени")}<input aria-label={t("Формат времени")} readOnly value={timeFormat}/></label><label>{t("Смысл метки времени")}<select aria-label={t("Смысл метки времени")} required value={convention} onChange={e => setConvention(e.target.value)}><option value="">{t("Нужно подтвердить")}</option><option value="interval_start">{t("Начало интервала")}</option><option value="interval_end">{t("Конец интервала")}</option></select></label></div>
      <div className="form-grid"><label>{t("Интервал источника · минуты")}<input type="number" min="1" max="60" required value={interval} onChange={e => setInterval(Number(e.target.value))}/></label><label>{t("Задержка доступности · минуты")}<input type="number" min="0" max="1440" required value={lag} onChange={e => setLag(Number(e.target.value))}/></label><label>{t("Основание доступности данных")}<input required minLength={3} value={assumption} onChange={e => setAssumption(e.target.value)}/></label></div>
      {delimiter === decimal && <p role="alert">{t("Разделители полей и дробной части должны различаться.")}</p>}
      <h3>{t("Сопоставление полей")}</h3><div className="mapping-grid">{fields.map(([key, label]) => <label key={key}>{t(String(label))}<select aria-label={t(String(label))} required value={headers.includes(mapping[key]) ? mapping[key] : ""} onChange={e => setMapping({ ...mapping, [key]: e.target.value })}><option value="">{t("Выберите колонку CSV")}</option>{headers.map((header, i) => <option key={i} value={header}>{header}</option>)}</select></label>)}</div>
      {headers.length > 0 && <><div className="table-scroll"><table><caption>{t("Предпросмотр · значения без преобразований")}</caption><thead><tr>{headers.map((header, i) => <th key={i}>{header}</th>)}</tr></thead><tbody>{preview.rows.slice(1).map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j}>{value}</td>)}</tr>)}</tbody></table></div>{mappingError && <p role="status" className="warning-text">{t(mappingError)}</p>}</>}
      <p className="muted">{t("Мощность должна быть нормализована в исходной шкале; ветер — м/с, температура — °C. Неизвестные единицы и часовой пояс нельзя определять молча. Февраль 2026 выделяется сервером в evaluation-only.")}</p>
      <label className="checkbox" onChange={e => e.stopPropagation()}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{t(" Подтверждаю mapping, исходный часовой пояс, смысл времени и единицы")}</label>
      <button className="primary" disabled={busy || reading || !file || !!mappingError || !!preview.error || !confirmed || !currentAsset || !sourceZone || !convention || !timeFormat.trim() || assumption.trim().length < 3 || delimiter === decimal}>{busy ? t("Отправляем…") : transport === "fixture" ? t("Проверить демосценарий импорта") : t("Загрузить и проверить")}</button>
      {transport === "fixture" && <p className="muted">{t("Файл остаётся в браузере. Отчёт синтетический, его числа не относятся к выбранному файлу.")}</p>}
    </fieldset></form>{error && <div role="alert" className="notice danger">{error}</div>}</section>
    <section className="panel"><h2>{t("Отчёт обработки CSV")}</h2><form className="inline-form" onSubmit={e => { e.preventDefault(); setReportId(reportInput.trim()); }}><label>{t("Идентификатор импорта")}<input aria-label={t("Идентификатор импорта")} required value={reportInput} onChange={e => setReportInput(e.target.value)} placeholder="import_id"/></label><button disabled={!reportInput.trim()}>{t("Открыть отчёт")}</button></form>{reportId && <ImportReport id={reportId} key={reportId}/>}</section>
  </div>;
}
