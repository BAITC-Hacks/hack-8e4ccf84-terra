"use client";
import { usePreferences } from "../platform/preferences";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useDashboard } from "./shell";
import { Badge, ResourceNotice, useResource } from "./resource";
import { JobStatus } from "./job";
const toolLabels: Record<string, string> = {fetch_weather_run: "Загрузка погоды", validate_inputs: "Проверка данных", predict: "Расчёт прогноза", explain: "Подготовка вывода"};
function Run({ id }: {
    id: string;
}) {
    const { t, dateLabel } = usePreferences();
    const { client, timezone, mode } = useDashboard();
    const loader = useCallback((signal: AbortSignal) => client.agentRun(id, signal), [client, id]);
    const resource = useResource(loader);
    const run = resource.data;
    return <><ResourceNotice {...resource} empty={run?.steps.length === 0}/>{run && <><div className="panel-heading"><div><h2>{t("Запуск ")}{run.id}</h2><p>{t("Режим: ")}{run.mode}{t(" · время ")}{timezone}</p></div><Badge status={run.status}/></div>{run.mode !== mode ? <div role="alert" className="notice warning">{t("Запуск относится к режиму ")}{run.mode}{t(". Выберите этот режим для просмотра журнала.")}</div> : <><ol className="timeline">{run.steps.map((step, i) => <li key={step.id}><span className={`step-number ${step.status}`}>{i + 1}</span><div><div className="inline-heading"><h3 title={step.tool}>{t(toolLabels[step.tool] ?? step.tool)}</h3><Badge status={step.status}/></div><p>{step.reason}</p><small>{dateLabel(step.time, timezone)} {timezone} · {step.duration_ms}{t(" мс")}</small>{step.error && <p className="error-text" role="alert">{step.error}</p>}</div></li>)}</ol>{run.forecast_id && <Link className="button" href={`/forecast?version=${encodeURIComponent(run.forecast_id)}`}>{t("Открыть результат →")}</Link>}</>}</>}</>;
}
export function AgentLog() {
    const { t } = usePreferences();
    const { transport, scenario } = useDashboard();
    const [input, setInput] = useState(transport === "fixture" ? "demo-run" : "");
    const [runId, setRunId] = useState(transport === "fixture" && scenario !== "empty" ? "demo-run" : "");
    const [jobInput, setJobInput] = useState("");
    const [jobId, setJobId] = useState("");
    return <><div className="page-heading"><div><h1>{t("Журнал агента")}</h1></div></div>
    <section className="panel"><form className="inline-form" onSubmit={e => { e.preventDefault(); setRunId(input.trim()); }}><label>{t("Идентификатор запуска")}<input aria-label={t("Идентификатор запуска")} required value={input} onChange={e => setInput(e.target.value)} placeholder="agent_run_id"/></label><button className="primary" disabled={!input.trim()}>{t("Открыть журнал")}</button></form>{runId ? <Run key={runId} id={runId}/> : <div className="empty"><h3>{t("Запуск не выбран")}</h3><p>{t("Введите ID запуска, чтобы открыть журнал.")}</p></div>}</section>
    <section className="panel"><h2>{t("Активная задача")}</h2><form className="inline-form" onSubmit={e => { e.preventDefault(); setJobId(jobInput.trim()); }}><label>{t("Идентификатор задачи")}<input aria-label={t("Идентификатор задачи")} required value={jobInput} onChange={e => setJobInput(e.target.value)} placeholder="job_id"/></label><button disabled={!jobInput.trim()}>{t("Проверить задачу")}</button></form>{jobId && <JobStatus key={jobId} id={jobId}/>}</section>
  </>;
}
