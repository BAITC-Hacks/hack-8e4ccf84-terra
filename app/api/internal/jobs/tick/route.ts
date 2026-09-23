import { agentRuntime } from "@/src/server/agent/runtime";

export const runtime = "nodejs";

export async function POST() {
  try {
    const job = await agentRuntime().runner.tick();
    if (!job) return Response.json({ status: "idle" });
    return Response.json({ status: "progressed", job_id: job.id, step: job.step });
  } catch {
    return Response.json({ code: "TICK_FAILED", message: "Job tick failed",
      request_id: crypto.randomUUID() }, { status: 503 });
  }
}
