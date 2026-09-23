import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  client ??= postgres(process.env.DATABASE_URL, { max: 5, connect_timeout: 5 });
  return client;
}
