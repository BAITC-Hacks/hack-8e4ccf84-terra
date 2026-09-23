"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useDashboard } from "./shell";
import { Badge, dateLabel, ResourceNotice, useResource } from "./resource";
import { JobStatus } from "./job";

function Run({ id }: { id: string }) {
  const { client, timezone, mode } = useDashboard();
  const loader = useCallback((signal: AbortSignal) => client.agentRun(id, signal), [client, id]);
  const resource = useResource(loader); const run = resource.data;
  return <><ResourceNotice {...resource} empty={run?.steps.length === 0} />{run && <><div className="panel-heading"><div><h2>Запуск {run.id}</h2><p>Режим: {run.mode} · время {timezone}</p></div><Badge status={run.status} /></div>{run.mode !== mode ? <div role="alert" className="notice warning">Запуск относится к режиму {run.mode}. Выберите этот режим для просмотра журнала.</div> : <><ol className="timeline">{run.steps.map((step, i) => <li key={step.id}><span className={`step-number ${step.status}`}>{i + 1}</span><div><div className="inline-heading"><h3>{step.tool}</h3><Badge status={step.status} /></div><p>{step.reason}</p><small>{dateLabel(step.time, timezone)} {timezone} · {step.duration_ms} мс</small>{step.error && <p className="error-text" role="alert">{step.error}</p>}</div></li>)}</ol>{run.forecast_id && <Link className="button" href={`/forecast?version=${encodeURIComponent(run.forecast_id)}`}>Открыть результат →</Link>}</>}</>}</>;
}
export function AgentLog() {
  const { transport, scenario } = useDashboard();
  const [input, setInput] = useState(transport === "fixture" ? "demo-run" : ""); const [runId, setRunId] = useState(transport === "fixture" && scenario !== "empty" ? "demo-run" : "");
  const [jobInput, setJobInput] = useState(""); const [jobId, setJobId] = useState("");
  return <><div className="page-heading"><div><div className="eyebrow">АГЕНТ / ПРИЧИНЫ И РЕЗУЛЬТАТЫ</div><h1>Журнал агента</h1><p>От выбора погодного прогона до публикации новой версии.</p></div></div>
    <section className="panel"><form className="inline-form" onSubmit={e => { e.preventDefault(); setRunId(input.trim()); }}><label>Идентификатор запуска<input aria-label="Идентификатор запуска" required value={input} onChange={e => setInput(e.target.value)} placeholder="agent_run_id" /></label><button className="primary" disabled={!input.trim()}>Открыть журнал</button></form>{runId ? <Run key={runId} id={runId} /> : <div className="empty"><h3>Запуск не выбран</h3><p>Укажите идентификатор из результата серверной задачи.</p></div>}</section>
    <section className="panel"><h2>Активная задача</h2><p>Статус обновляется каждые 2,5 секунды до завершения. После ошибки доступна повторная загрузка.</p><form className="inline-form" onSubmit={e => { e.preventDefault(); setJobId(jobInput.trim()); }}><label>Идентификатор задачи<input aria-label="Идентификатор задачи" required value={jobInput} onChange={e => setJobInput(e.target.value)} placeholder="job_id" /></label><button disabled={!jobInput.trim()}>Проверить задачу</button></form>{jobId && <JobStatus key={jobId} id={jobId} />}</section>
  </>;
}
