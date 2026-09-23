import type { NextRequest } from "next/server";
import { SESSION_COOKIE, validSession } from "@/src/server/auth/session";
import { apiError } from "@/src/server/auth/response";
import { agentRuntime } from "@/src/server/agent/runtime";

export const runtime = "nodejs";
const externalStatus = (status: string) => status === "completed" ? "succeeded" : status;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value))
    return apiError(401, "UNAUTHORIZED", "Administrator session required", requestId);
  const id = (await params).id;
  const { store } = agentRuntime();
  const job = await store.get(id);
  if (!job) return apiError(404, "NOT_FOUND", "Agent run not found", requestId);
  const after = Math.max(0, Number(request.nextUrl.searchParams.get("after") ?? 0) || 0);
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 50) || 50));
  const events = (await store.events(id)).filter((event) => event.sequence > after).slice(0, limit);
  return Response.json({ id, status: externalStatus(job.status), mode: job.payload.mode,
    issued_at: job.payload.issuedAt, result_id: job.resultId, error: job.errorCode ? { code: job.errorCode } : null,
    decision: job.checkpoint.decision ?? null, briefing: job.checkpoint.explanation ?? null,
    snapshots: { weather_run_ids: (job.checkpoint.weather as { runIds?: string[] } | undefined)?.runIds ?? [],
      observation_count: Array.isArray(job.checkpoint.observations) ? job.checkpoint.observations.length : 0 },
    events, next_cursor: events.length === limit ? events.at(-1)!.sequence : null });
}
