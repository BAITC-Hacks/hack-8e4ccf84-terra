"use client";
import {useState} from "react";
import {usePreferences} from "../platform/preferences";
import type {DashboardClient} from "./client";
import type {Transport} from "./contracts";
import type {WeatherResult} from "./source-contracts";

export function WeatherConnector({client, transport}: {client: DashboardClient; transport: Transport}) {
  const {t, dateLabel} = usePreferences();
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [run, setRun] = useState("");
  const [result, setResult] = useState<WeatherResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(undefined);
    try {
      setResult(await client.weather({latitude: Number(latitude), longitude: Number(longitude), initializedAt: new Date(`${run}:00Z`).toISOString()}));
    } catch (failure) {setError(failure instanceof Error ? failure.message : t("Не удалось проверить доступ."));}
    finally {setBusy(false);}
  }
  return <section id="connector-weather" className="panel weather-connector">
    <div className="panel-heading"><div><div className="eyebrow">OPEN-METEO / ECMWF IFS</div><h2>Weather API</h2><p>{t("Укажите координаты и время выпуска прогноза в UTC.")}</p></div><span className={`badge ${result ? "ready" : error ? "error" : "planned"}`}>{t(result ? "Доступ подтверждён" : busy ? "Проверяем…" : error ? "Ошибка" : "Не проверено")}</span></div>
    {transport === "fixture" && <p className="notice neutral">{t("Демо: показан пример ответа.")}</p>}
    <form onSubmit={submit} onChange={() => {setResult(undefined); setError("");}}>
      <fieldset disabled={busy} className="connector-fields"><div className="form-grid">
        <label>{t("Широта")}<input type="number" step="any" min="-90" max="90" required value={latitude} onChange={e => setLatitude(e.target.value)}/></label>
        <label>{t("Долгота")}<input type="number" step="any" min="-180" max="180" required value={longitude} onChange={e => setLongitude(e.target.value)}/></label>
        <label>{t("Прогон · UTC")}<input type="datetime-local" step="21600" min="2024-03-14T00:00" required value={run} onChange={e => setRun(e.target.value)}/></label>
      </div><p className="muted">{t("Циклы: 00, 06, 12, 18 UTC. Проверка не включает автоматическую загрузку и не доказывает историческую доступность.")}</p>
      <button type="submit" className="primary">{t(busy ? "Проверяем…" : "Проверить доступ")}</button></fieldset>
    </form>
    {error && <div role="alert" className="notice danger">{error}</div>}
    {result && <div className="notice success" role="status"><strong>{t("Погодный прогон доступен")}</strong><span>{dateLabel(result.checkedAt, "UTC")} UTC · {result.hours} h</span><span>{result.fields.map(field => `${field} (${result.units[field] ?? "—"})`).join(" · ")}</span></div>}
  </section>;
}
