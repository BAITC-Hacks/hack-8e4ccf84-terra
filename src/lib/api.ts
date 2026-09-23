import {z} from "zod";
import {agentRunner} from "../agent/runner";
import {AppError, normalizeError} from "../agent/errors";
import {jsonResponse} from "./json";

export const idSchema = z.uuid();

export async function api(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    const status =
        error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : error instanceof AppError
                ? error.code === "not_found"
                    ? 404
                    : error.code === "conflict"
                        ? 409
                        : 400
                : 503;
    return jsonResponse({error: normalizeError(error)}, status);
  }
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new AppError("forbidden", "Cross-origin mutations are not allowed.");
}

export async function snapshot(id: string) {
  const row = await agentRunner.recover(id);
  // Serialized SDK state is server-private; expose only product-facing fields.
  const run = {
    id: row.id,
    domainKey: row.domainKey,
    objective: row.objective,
    status: row.status,
    model: row.model,
    result: row.result,
    error: row.error,
    cancelRequestedAt: row.cancelRequestedAt,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
  return {run, approvals: await agentRunner.store.approvals(id)};
}

export function executionStream(id: string) {
  let disconnected = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) => {
        if (!disconnected)
          controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      };
      send({type: "run", runId: id});
      try {
        await agentRunner.execute(id);
        send({type: "settled", runId: id});
      } catch (error) {
        send({type: "error", error: normalizeError(error)});
      } finally {
        if (!disconnected) controller.close();
      }
    },
    cancel() {
      disconnected = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
