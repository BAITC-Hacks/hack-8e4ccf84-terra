"use client";
import Link from "next/link";
import {useCallback, useEffect, useRef, useState} from "react";
import {ObjectivePanel} from "./objective-panel";
import {RunHeader} from "./run-header";
import {Timeline} from "./timeline";
import {EvidencePanel} from "./evidence-panel";
import {ApprovalCard} from "./approval-card";
import {ResultPanel} from "./result-panel";
import {ErrorPanel} from "./error-panel";
import type {ApprovalView, EventView, RunView, SafeError} from "./types";

async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error?.message ?? "Request failed. Please try again.");
  }
  return response;
}

export function AgentWorkspace({initialRunId}: { initialRunId?: string }) {
  const [runId, setRunId] = useState(initialRunId);
  const [run, setRun] = useState<RunView | null>(null);
  const [events, setEvents] = useState<EventView[]>([]);
  const [approvals, setApprovals] = useState<ApprovalView[]>([]);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<SafeError | null>(null);
  const submitting = useRef(false);
  const cursor = useRef("0");
  const report = (e: unknown) =>
      setError({
        code: "request_failed",
        message:
            e instanceof Error ? e.message : "Could not connect to the workspace.",
        retryable: true,
      });
  const refresh = useCallback(async (id: string) => {
    const [snapshot, delta] = await Promise.all([
      fetch(`/api/runs/${id}`)
      .then(checked)
      .then((r) => r.json()),
      fetch(`/api/runs/${id}/events?after=${cursor.current}`)
      .then(checked)
      .then((r) => r.json()),
    ]);
    setRun(snapshot.run);
    setApprovals(snapshot.approvals);
    const incoming = delta.events as EventView[];
    if (incoming.length) {
      cursor.current = incoming.at(-1)!.seq;
      setEvents((prior) => [
        ...new Map([...prior, ...incoming].map((e) => [e.id, e])).values(),
      ]);
    }
  }, []);
  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await refresh(runId);
      } catch (e) {
        if (!stopped) report(e);
      } finally {
        if (!stopped) timer = setTimeout(poll, 1000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [runId, refresh]);

  async function consume(response: Response) {
    await checked(response);
    if (!response.headers.get("content-type")?.includes("ndjson")) return;
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream: true});
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const message = JSON.parse(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        if (message.type === "run") {
          setRunId(message.runId);
          window.history.replaceState(null, "", `/runs/${message.runId}`);
        }
        if (message.type === "error") setError(message.error);
      }
    }
  }

  async function mutate(path: string, body?: unknown) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await consume(
          await fetch(path, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: body ? JSON.stringify(body) : undefined,
          }),
      );
      if (runId) await refresh(runId);
    } catch (e) {
      report(e);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function cancel() {
    if (cancelling || !runId) return;
    setCancelling(true);
    try {
      await checked(
          await fetch(`/api/runs/${runId}/cancel`, {method: "POST"}),
      );
      await refresh(runId);
    } catch (e) {
      report(e);
    } finally {
      setCancelling(false);
    }
  }

  return (
      <>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark">A</span>Agent Workspace
          </Link>
          <span className="topbar-note">Evidence. Action. Oversight.</span>
        </header>
        <main className="workspace">
          {error && <ErrorPanel error={error}/>}
          {!runId ? (
              <>
                <ObjectivePanel
                    busy={busy}
                    onRun={(objective) =>
                        void mutate("/api/runs", {objective, domainKey: "demo"})
                    }
                />
                <div className="principles">
                  <div>
                    <span>01</span>
                    <h3>Observe the work</h3>
                    <p>Every tool call has a place in the timeline.</p>
                  </div>
                  <div>
                    <span>02</span>
                    <h3>Inspect the evidence</h3>
                    <p>Conclusions link to retrieved sources.</p>
                  </div>
                  <div>
                    <span>03</span>
                    <h3>Keep control</h3>
                    <p>Proposed actions wait for your approval.</p>
                  </div>
                </div>
              </>
          ) : run ? (
              <>
                <RunHeader
                    run={run}
                    busy={cancelling}
                    onCancel={() => void cancel()}
                />
                <div className="workspace-grid">
                  <Timeline events={events}/>
                  <aside>
                    {approvals
                    .filter(
                        (a) =>
                            a.status === "pending" &&
                            run.status === "waiting_approval",
                    )
                    .map((a) => (
                        <ApprovalCard
                            key={a.id}
                            approval={a}
                            busy={busy}
                            onDecide={(id, decision, reason) =>
                                void mutate(`/api/runs/${runId}/approvals/${id}`, {
                                  decision,
                                  reason,
                                })
                            }
                        />
                    ))}
                    {run.error && <ErrorPanel error={run.error}/>}
                    {run.result && (
                        <ResultPanel result={run.result} events={events}/>
                    )}
                    {run.status === "cancelled" && (
                        <section className="panel">
                          <h2>Run cancelled</h2>
                          <p>
                            Execution has stopped. The activity and evidence remain
                            available.
                          </p>
                        </section>
                    )}
                    <EvidencePanel events={events}/>
                    {approvals
                    .filter((a) => a.status !== "pending")
                    .map((a) => (
                        <ApprovalCard
                            key={a.id}
                            approval={a}
                            busy={false}
                            onDecide={() => {
                            }}
                        />
                    ))}
                  </aside>
                </div>
              </>
          ) : (
              <p className="empty">Loading workspace…</p>
          )}
        </main>
        <footer className="footer">
          One objective. One agent. A visible record.
        </footer>
      </>
  );
}
