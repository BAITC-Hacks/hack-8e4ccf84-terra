import type { NextRequest } from "next/server";
import { SESSION_COOKIE, validSession } from "@/src/server/auth/session";
import { apiError } from "@/src/server/auth/response";
import { database } from "@/src/server/db/client";
import { PostgresReplayStore } from "@/src/server/replay/store";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value))
    return apiError(401, "UNAUTHORIZED", "Administrator session required", requestId);
  const session = await new PostgresReplayStore(database()).get((await params).id);
  if (!session) return apiError(404, "NOT_FOUND", "Replay session not found", requestId);
  return Response.json({ id: session.id, status: session.status, virtual_time: session.virtualTime,
    cursor: session.cursor, config: session.config });
}
