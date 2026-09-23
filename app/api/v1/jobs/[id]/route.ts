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
  const job = await agentRuntime().store.get((await params).id);
  if (!job) return apiError(404, "NOT_FOUND", "Job not found", requestId);
  return Response.json({ id: job.id, status: externalStatus(job.status),
    progress: { step: job.step, attempt: job.attempt }, result_id: job.resultId,
    error: job.errorCode ? { code: job.errorCode } : null });
}
