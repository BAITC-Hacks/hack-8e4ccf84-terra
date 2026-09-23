import {readFile} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import postgres from "postgres";
import {evaluatePublishedForecasts, evaluationRequestSchema} from "../evaluation/worker";

/** Deployment entry point over P5's idempotent evaluator; no second queue or inference call. */
async function main() {
  const configPath = process.argv[2];
  const pollMs = Number(process.env.EVALUATION_POLL_MS ?? 30_000);
  if (!configPath || !process.env.DATABASE_URL || !Number.isInteger(pollMs) || pollMs < 1000 || pollMs > 3_600_000)
    throw new Error("EVALUATION_WORKER_CONFIGURATION_INVALID");
  const sql = postgres(process.env.DATABASE_URL, {max: 2, connect_timeout: 5,
    connection: {statement_timeout: 30_000}});
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let previousId: string | undefined;
  try {
    while (!controller.signal.aborted) {
      try {
        const input = evaluationRequestSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
        if (controller.signal.aborted) break;
        const result = await evaluatePublishedForecasts(sql, input);
        if (result.report.id !== previousId) {
          console.log(JSON.stringify({evaluationId: result.report.id, version: result.version,
            n: result.report.evaluatedPairCount, coverage: result.report.coverage}));
          previousId = result.report.id;
        }
      } catch {
        if (!controller.signal.aborted) console.error("EVALUATION_POLL_FAILED; verify config, semantics and publications; retrying");
      }
      try { await delay(pollMs, undefined, {signal: controller.signal}); }
      catch (error) {if (!controller.signal.aborted) throw error;}
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await sql.end({timeout: 5});
  }
}

main().catch(() => { console.error("EVALUATION_WORKER_FAILED"); process.exitCode = 1; });
