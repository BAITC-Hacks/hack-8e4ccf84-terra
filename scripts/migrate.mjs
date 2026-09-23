import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = postgres(url, { max: 1 });
try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const directory = join(process.cwd(), "src/server/db/migrations");
  for (const name of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
    const [existing] = await sql`SELECT name FROM schema_migrations WHERE name = ${name}`;
    if (existing) continue;
    const contents = await readFile(join(directory, name), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    console.log(`Applied ${name}`);
  }
} finally {
  await sql.end();
}
