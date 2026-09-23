import {jsonResponse} from "@/src/lib/json";
import {backtestApi, backtestRequestSchema, requireBacktestAccess} from "@/src/server/backtest/http";
import {backtestRegistry} from "@/src/server/backtest/registry";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return backtestApi(async () => {
    requireBacktestAccess(request);
    const body = backtestRequestSchema.parse(await request.json());
    const {job, reused} = backtestRegistry.enqueue({
      assetIds: body.asset_ids,
      issueTimes: body.issue_times.map((value) => new Date(value).toISOString()),
      horizonHours: body.horizon_hours,
      modelVersion: body.model_version,
      trainingCutoff: new Date(body.training_cutoff).toISOString(),
      evaluationStart: body.evaluation_start ? new Date(body.evaluation_start).toISOString() : undefined,
      evaluationEndExclusive: body.evaluation_end_exclusive
        ? new Date(body.evaluation_end_exclusive).toISOString()
        : undefined,
    }, request.headers.get("idempotency-key"));
    return jsonResponse({job_id: job.id, status: job.status, reused}, 202);
  });
}
