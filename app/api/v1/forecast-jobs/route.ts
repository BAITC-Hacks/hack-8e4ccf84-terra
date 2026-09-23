import type {NextRequest} from "next/server";
import {ZodError} from "zod";
import {SESSION_COOKIE, validSession} from "@/src/server/auth/session";
import {parseForecastRequest} from "@/src/server/forecast/request";
import {forecastRuntime, resolveForecastModelId} from "@/src/server/forecast/runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return Response.json({code: "UNAUTHORIZED", message: "Administrator session required",
      request_id: requestId}, {status: 401});
  }
  let input;
  try {
    input = parseForecastRequest(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError ||
      (error instanceof Error && error.message === "INVALID_FORECAST_REQUEST")) {
      return Response.json({code: "INVALID_FORECAST_REQUEST", message: "Invalid forecast request",
        request_id: requestId}, {status: 400});
    }
    return Response.json({code: "REQUEST_FAILED", message: "Could not read request",
      request_id: requestId}, {status: 400});
  }
  try {
    input.modelVersionId = await resolveForecastModelId(input.modelVersionId);
    const forecast = await (await forecastRuntime(input.modelVersionId)).run(input);
    return Response.json({forecast_id: forecast.id, status: forecast.status,
      version: forecast.version, idempotency_key: forecast.idempotencyKey,
      incomplete_reasons: forecast.incompleteReasons},
    {status: forecast.status === "published" ? 201 : 422});
  } catch (error) {
    const code = error instanceof Error ? error.message : "FORECAST_FAILED";
    if (code === "MODEL_NOT_APPROVED") {
      return Response.json({code, message: "Approved model version not found",
        request_id: requestId}, {status: 422});
    }
    return Response.json({code: "FORECAST_FAILED", message: "Forecast could not be calculated",
      request_id: requestId}, {status: 503});
  }
}
