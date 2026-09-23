import { mkdir, readFile, rename, writeFile, rmdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { BatchConfigSchema, createManifest, exportBatch, runBatch, type Manifest } from "../src/server/replay/batch/index";
import { postgresBatchAdapter } from "../src/server/replay/batch/postgres";

async function atomic(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await rename(temporary, path);
}
async function main() {
  const { values: args } = parseArgs({ options: {
    assets: { type: "string" }, model: { type: "string" }, timezone: { type: "string" },
    "issue-hour": { type: "string" }, from: { type: "string" }, to: { type: "string" },
    mode: { type: "string" }, "config-version": { type: "string" }, "resume-id": { type: "string" },
    output: { type: "string", default: ".replay-batch" }, "max-polls": { type: "string", default: "300" },
    "poll-ms": { type: "string", default: "1000" }, help: { type: "boolean" },
  }});
  if (args.help) {
    console.log("node --import tsx scripts/replay-february.ts --assets UUID,UUID --model UUID --timezone Asia/Almaty --issue-hour 0 --mode replay [--from 2026-01-31 --to 2026-02-28] [--resume-id SHA256] [--output DIR] [--max-polls 300 --poll-ms 1000]");
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  const config = BatchConfigSchema.parse({ assetIds: args.assets?.split(","), modelVersionId: args.model,
    timezone: args.timezone, issueHour: args["issue-hour"] === undefined ? undefined : Number(args["issue-hour"]),
    from: args.from, to: args.to, mode: args.mode, configVersion: args["config-version"] });
  const planned = createManifest(config);
  if (args["resume-id"] && args["resume-id"] !== planned.id) throw new Error("RESUME_CONFIG_MISMATCH");
  const directory = resolve(args.output!);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${planned.id}.json`), lock = `${path}.lock`;
  await mkdir(lock); // Fail closed on concurrent use; never remove another process's lock.
  const sql = postgres(process.env.DATABASE_URL, { max: 2, connect_timeout: 5,
    connection: { statement_timeout: 30000 } });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    let manifest: Manifest;
    try { manifest = JSON.parse(await readFile(path, "utf8")) as Manifest; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || args["resume-id"]) throw error;
      manifest = planned;
    }
    await atomic(path, manifest);
    const adapter = postgresBatchAdapter(sql);
    await runBatch(manifest, adapter, m => atomic(path,m), { maxPolls: Number(args["max-polls"]),
      pollMs: Number(args["poll-ms"]), signal: controller.signal });
    await atomic(join(directory, `${manifest.id}.forecasts.json`), await exportBatch(manifest,adapter));
    console.log(JSON.stringify({ id: manifest.id, manifest: path, total: manifest.releases.length,
      completed: manifest.releases.filter(r => r.status === "completed").length, officialResult: false }));
    if (manifest.releases.some(r => r.status !== "completed")) process.exitCode = 2;
  } finally {
    process.off("SIGINT",stop); process.off("SIGTERM",stop);
    await sql.end({ timeout: 5 }); await rmdir(lock);
  }
}
main().catch(() => { console.error("REPLAY_BATCH_FAILED: check CLI parameters, manifest lock, and database availability; no fallback was used."); process.exitCode = 1; });
