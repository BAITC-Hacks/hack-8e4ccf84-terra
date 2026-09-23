import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { SESSION_COOKIE, validSession } from "@/src/server/auth/session";
import { apiError } from "@/src/server/auth/response";
import { parseAgentRequest } from "@/src/server/agent/request";
import { agentRuntime } from "@/src/server/agent/runtime";
import { resolveForecastModelId } from "@/src/server/forecast/runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value))
    return apiError(401, "UNAUTHORIZED", "Administrator session required", requestId);
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 200) return apiError(400, "INVALID_IDEMPOTENCY_KEY",
    "Idempotency-Key is required", requestId);
  try {
    const payload = parseAgentRequest(await request.json(), key);
    payload.modelVersionId = await resolveForecastModelId(payload.modelVersionId);
    const job = await agentRuntime().store.enqueue(key, payload, new Date().toISOString(), 3);
    return Response.json({ job_id: job.id, agent_run_id: job.id }, { status: 202 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError ||
      (error instanceof Error && error.message === "INVALID_AGENT_REQUEST")) {
      return apiError(400, "INVALID_AGENT_REQUEST", "Invalid agent run request", requestId);
    }
    if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT")
      return apiError(409, "IDEMPOTENCY_CONFLICT", "Key already belongs to another request", requestId);
    if (error instanceof Error && error.message === "MODEL_NOT_APPROVED")
      return apiError(422, "MODEL_NOT_APPROVED", "Approved model version not found", requestId);
    return apiError(503, "AGENT_ENQUEUE_FAILED", "Agent run could not be queued", requestId);
  }
}
