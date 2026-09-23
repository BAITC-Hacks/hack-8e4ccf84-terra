export function apiError(status: number, code: string, message: string, requestId = crypto.randomUUID()) {
  return Response.json({ code, message, request_id: requestId }, { status });
}
