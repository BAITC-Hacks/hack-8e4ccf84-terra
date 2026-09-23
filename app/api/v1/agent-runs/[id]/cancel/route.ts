import type { NextRequest } from "next/server";
import { SESSION_COOKIE, validSession } from "@/src/server/auth/session";
import { apiError } from "@/src/server/auth/response";
import { agentRuntime } from "@/src/server/agent/runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value))
    return apiError(401, "UNAUTHORIZED", "Administrator session required", requestId);
  const { store } = agentRuntime();
  const id = (await params).id;
  const before = await store.get(id);
  if (!before) return apiError(404, "NOT_FOUND", "Agent run not found", requestId);
  if (before.status === "completed" || before.checkpoint.publicationCommitted) return apiError(409, "ALREADY_PUBLISHED",
    "Published agent run cannot be cancelled", requestId);
  const job = await store.cancel(id, new Date().toISOString());
  return Response.json({ id: job!.id, status: job!.status });
}
