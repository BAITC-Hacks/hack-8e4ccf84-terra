import {backtestApi, requireBacktestAccess} from "@/src/server/backtest/http";
import {backtestRegistry} from "@/src/server/backtest/registry";
import {exportForecastCsv} from "@/src/server/export/forecast-csv";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  {params}: {params: Promise<{id: string}>},
): Promise<Response> {
  return backtestApi(async () => {
    requireBacktestAccess(request);
    const {id} = await params;
    return new Response(exportForecastCsv(backtestRegistry.getForecast(id)), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="forecast-${safeFilename(id)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
