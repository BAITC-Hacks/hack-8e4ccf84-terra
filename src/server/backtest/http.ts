import {randomUUID, timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {jsonResponse} from "../../lib/json";
import {BacktestConflictError, BacktestNotFoundError} from "./registry";

export const backtestRequestSchema = z.object({
  asset_ids: z.array(z.string().min(1)).min(1),
  issue_times: z.array(z.iso.datetime({offset: true})).min(1),
  horizon_hours: z.union([z.literal(24), z.literal(48)]),
  model_version: z.string().min(1),
  training_cutoff: z.iso.datetime({offset: true}),
  evaluation_start: z.iso.datetime({offset: true}).optional(),
  evaluation_end_exclusive: z.iso.datetime({offset: true}).optional(),
}).superRefine((value, context) => {
  const issues = value.issue_times.map(Date.parse);
  const firstAllowedIssue = Date.parse("2026-01-31T00:00:00.000Z");
  const lastAllowedIssue = Date.parse("2026-02-28T23:59:59.999Z");
  if (issues.some((issue, index) => issue < firstAllowedIssue
    || issue > lastAllowedIssue
    || (index > 0 && issue <= issues[index - 1]))) {
    context.addIssue({
      code: "custom",
      path: ["issue_times"],
      message: "Release times must be unique, increasing, and span 2026-01-31 through February UTC.",
    });
  }
  const cutoff = Date.parse(value.training_cutoff);
  if (cutoff > Date.parse("2026-01-31T23:59:59.999Z") || cutoff > Math.min(...issues)) {
    context.addIssue({
      code: "custom",
      path: ["training_cutoff"],
      message: "Training cutoff must not exceed 2026-01-31 or the first release.",
    });
  }
  if (value.evaluation_start && value.evaluation_end_exclusive
    && Date.parse(value.evaluation_start) >= Date.parse(value.evaluation_end_exclusive)) {
    context.addIssue({
      code: "custom",
      path: ["evaluation_end_exclusive"],
      message: "Evaluation end must be after its start.",
    });
  }
  if ((value.evaluation_start && new Date(value.evaluation_start).toISOString() !== "2026-02-01T00:00:00.000Z")
    || (value.evaluation_end_exclusive
      && new Date(value.evaluation_end_exclusive).toISOString() !== "2026-03-01T00:00:00.000Z")) {
    context.addIssue({
      code: "custom",
      path: ["evaluation_start"],
      message: "The official evaluation interval is fixed to February 2026 UTC.",
    });
  }
});

export function requireBacktestAccess(request: Request): void {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) {
    throw new BacktestHttpError(
      "authentication_unavailable",
      "Administrator authentication is not configured.",
      503,
    );
  }
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new BacktestHttpError("unauthorized", "A valid administrator session is required.", 401);
  }
}

export class BacktestHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function backtestApi(operation: () => Promise<Response> | Response): Promise<Response> {
  const requestId = randomUUID();
  try {
    return await operation();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("invalid_request", "Request validation failed.", requestId, 400, error.issues);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("invalid_json", "Request body must be valid JSON.", requestId, 400);
    }
    if (error instanceof BacktestConflictError) {
      return errorResponse(error.code, error.message, requestId, 409);
    }
    if (error instanceof BacktestNotFoundError) {
      return errorResponse(error.code, error.message, requestId, 404);
    }
    if (error instanceof BacktestHttpError) {
      return errorResponse(error.code, error.message, requestId, error.status, error.details);
    }
    return errorResponse("internal_error", "The request could not be completed.", requestId, 500);
  }
}

function errorResponse(code: string, message: string, requestId: string, status: number, details?: unknown) {
  return jsonResponse({error: {code, message, request_id: requestId, ...(details === undefined ? {} : {details})}}, status);
}
