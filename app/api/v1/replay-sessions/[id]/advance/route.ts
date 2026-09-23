import type { NextRequest } from "next/server";
import { SESSION_COOKIE, validSession } from "@/src/server/auth/session";
import { apiError } from "@/src/server/auth/response";
import { database } from "@/src/server/db/client";
import { ReplayAdvanceSchema } from "@/src/server/replay/request";
import { PostgresReplayStore } from "@/src/server/replay/store";

export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value))
    return apiError(401, "UNAUTHORIZED", "Administrator session required", requestId);
  try {
    const input = ReplayAdvanceSchema.parse(await request.json());
    const result = await new PostgresReplayStore(database()).advance((await params).id,
      new Date(input.to).toISOString());
    return Response.json({ id: result.session.id, virtual_time: result.session.virtualTime,
      cursor: result.session.cursor, job_ids: result.jobIds });
  } catch (error) {
    if (error instanceof Error && error.message === "REPLAY_NOT_FOUND")
      return apiError(404, "NOT_FOUND", "Replay session not found", requestId);
    if (error instanceof Error && error.message === "TIME_REVERSAL")
      return apiError(409, "TIME_REVERSAL", "Replay time must be monotonic", requestId);
    return apiError(400, "INVALID_REPLAY_ADVANCE", "Replay could not be advanced", requestId);
  }
}
