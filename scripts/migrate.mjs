import {readFile, readdir} from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const migrations = path.resolve("src/server/db/migrations");
const files = (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort();
const sql = postgres(process.env.DATABASE_URL, {max: 1});
try {
  for (const file of files) await sql.unsafe(await readFile(path.join(migrations, file), "utf8"));
  console.log(`Applied ${files.length} migration(s).`);
} finally {
  await sql.end();
}
