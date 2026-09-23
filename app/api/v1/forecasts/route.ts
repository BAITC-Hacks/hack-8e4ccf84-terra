import type {NextRequest} from "next/server";
import {SESSION_COOKIE, validSession} from "@/src/server/auth/session";
import {forecastDatabase} from "@/src/server/forecast/runtime";
import {PostgresForecastStore} from "@/src/server/forecast/postgres-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return Response.json({code: "UNAUTHORIZED", message: "Administrator session required",
      request_id: requestId}, {status: 401});
  }
  const search = request.nextUrl.searchParams;
  const mode = search.get("mode");
  const horizon = search.get("horizon_hours");
  const assetId = search.get("asset_id");
  const issuedAt = search.get("issued_at");
  if ((mode && !["live", "backtest", "replay"].includes(mode)) ||
    (horizon && !["24", "48"].includes(horizon)) ||
    (assetId && !/^[0-9a-f-]{36}$/i.test(assetId)) ||
    (issuedAt && Number.isNaN(Date.parse(issuedAt)))) {
    return Response.json({code: "INVALID_FILTER", message: "Invalid forecast filter",
      request_id: requestId}, {status: 400});
  }
  try {
    const store = new PostgresForecastStore(forecastDatabase());
    const forecasts = await store.list({assetId: assetId ?? undefined,
      issuedAt: issuedAt ? new Date(issuedAt).toISOString() : undefined,
      mode: mode as "live" | "backtest" | "replay" | undefined,
      horizonHours: horizon ? Number(horizon) as 24 | 48 : undefined});
    return Response.json({forecasts});
  } catch {
    return Response.json({code: "FORECAST_READ_FAILED", message: "Forecasts unavailable",
      request_id: requestId}, {status: 503});
  }
}
