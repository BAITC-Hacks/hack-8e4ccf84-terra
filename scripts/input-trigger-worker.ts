import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { InputTriggerWorker } from "../src/server/triggers";

async function main() {
  const configPath = process.argv[2];
  if (!configPath || !process.env.DATABASE_URL) throw new Error("Require config JSON path and DATABASE_URL");
  const config: unknown = JSON.parse(await readFile(configPath, "utf8"));
  const sql = postgres(process.env.DATABASE_URL, { max: 3, connect_timeout: 5,
    connection: { statement_timeout: 15_000 } });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const worker = new InputTriggerWorker(sql, config);
    if (process.argv.includes("--once")) await worker.tick(new Date().toISOString(), controller.signal);
    else await worker.run(controller.signal, () => console.error("INPUT_TRIGGER_POLL_FAILED; retrying"));
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
  console.error("INPUT_TRIGGER_WORKER_FAILED", /^[A-Z0-9_]{1,64}$/.test(code) ? code : "UNKNOWN");
  process.exitCode = 1;
});
