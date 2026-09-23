import {backtestRegistry, type BacktestRegistry} from "./registry";
import {BacktestRunner} from "./runner";

export async function executeBacktestJob(
  jobId: string,
  runner: BacktestRunner,
  registry: BacktestRegistry = backtestRegistry,
): Promise<void> {
  const job = registry.markRunning(jobId);
  try {
    registry.complete(await runner.run(job.request, job.id));
  } catch (error) {
    registry.fail(jobId, {
      code: error instanceof Error && "code" in error ? String(error.code) : "backtest_failed",
      message: error instanceof Error ? error.message : "Backtest failed.",
    });
    throw error;
  }
}
