import {readFile} from "node:fs/promises";
import postgres from "postgres";
import {importEvaluationActuals} from "../src/server/evaluation/actuals";
import {evaluatePublishedForecasts} from "../src/server/evaluation/worker";

async function main() {
  const [requestPath, actualsPath] = process.argv.slice(2);
  if (!requestPath || !process.env.DATABASE_URL) throw new Error("Usage: DATABASE_URL=... node --import tsx scripts/evaluate-forecasts.ts request.json [actuals.json]");
  const request: unknown = JSON.parse(await readFile(requestPath, "utf8"));
  const sql = postgres(process.env.DATABASE_URL, {max: 2});
  try {
    if (actualsPath) await importEvaluationActuals(sql, JSON.parse(await readFile(actualsPath, "utf8")));
    console.log(JSON.stringify(await evaluatePublishedForecasts(sql, request), null, 2));
  } finally { await sql.end(); }
}
main().catch(() => { console.error("Evaluation failed: verify request, confirmed semantics, publications and database migrations."); process.exitCode = 1; });
