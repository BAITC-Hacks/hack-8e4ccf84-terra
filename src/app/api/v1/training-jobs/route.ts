import {ZodError} from "zod";
import {
  trainingJobStore,
  TrainingJobConflictError,
} from "@/src/server/ml/training";

export async function createTrainingJob(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return Response.json({
        error: {code: "unsupported_media_type", message: "Content-Type must be application/json", request_id: requestId},
      }, {status: 415});
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json({
        error: {code: "forbidden", message: "Cross-origin mutations are not allowed", request_id: requestId},
      }, {status: 403});
    }
    const record = await trainingJobStore.create(
      await request.json(),
      request.headers.get("idempotency-key"),
    );
    return Response.json({
      job_id: record.id,
      status: record.status,
      progress: record.progress,
      cutoff: record.cutoff,
    }, {
      status: 202,
      headers: {Location: `/api/v1/training-jobs/${record.id}`},
    });
  } catch (error) {
    const conflict = error instanceof TrainingJobConflictError;
    const invalid = error instanceof ZodError || error instanceof SyntaxError;
    return Response.json({
      error: {
        code: conflict ? error.code : invalid ? "invalid_request" : "service_unavailable",
        message: conflict
          ? error.message
          : invalid
            ? "Request body is invalid"
            : "Training job could not be created",
        request_id: requestId,
        ...(error instanceof ZodError ? {details: error.issues} : {}),
      },
    }, {status: conflict ? 409 : invalid ? 400 : 503});
  }
}

export const POST = createTrainingJob;
