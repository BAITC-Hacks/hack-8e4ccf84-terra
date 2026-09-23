import {jsonResponse} from "@/src/lib/json";
import {backtestApi, requireBacktestAccess} from "@/src/server/backtest/http";
import {backtestRegistry} from "@/src/server/backtest/registry";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  {params}: {params: Promise<{id: string}>},
): Promise<Response> {
  return backtestApi(async () => {
    requireBacktestAccess(request);
    const {id} = await params;
    return jsonResponse({evaluation: backtestRegistry.getEvaluation(id)});
  });
}
