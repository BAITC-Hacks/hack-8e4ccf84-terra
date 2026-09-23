import type { NextRequest } from "next/server";
import { SESSION_COOKIE, validSession } from "@/src/server/auth/session";
import { apiError } from "@/src/server/auth/response";
import { database } from "@/src/server/db/client";
import { resolveForecastModelId } from "@/src/server/forecast/runtime";
import { ReplayRequestSchema } from "@/src/server/replay/request";
import { PostgresReplayStore } from "@/src/server/replay/store";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value))
    return apiError(401, "UNAUTHORIZED", "Administrator session required", requestId);
  try {
    const input = ReplayRequestSchema.parse(await request.json());
    const modelVersionId = await resolveForecastModelId(input.model_version);
    const session = await new PostgresReplayStore(database()).create({ assetIds: input.asset_ids,
      horizonHours: input.horizon_hours, modelVersionId, configVersion: input.config_version,
      dataPolicy: input.data_policy }, new Date(input.virtual_time).toISOString(),
    input.events.map((event) => ({ id: event.id, availableAt: new Date(event.available_at).toISOString(),
      issuedAt: new Date(event.issued_at).toISOString(), weatherRunId: event.weather_run_id })));
    return Response.json({ id: session.id, status: session.status, virtual_time: session.virtualTime,
      cursor: session.cursor }, { status: 201 });
  } catch {
    return apiError(400, "INVALID_REPLAY_SESSION", "Replay session could not be created", requestId);
  }
}
