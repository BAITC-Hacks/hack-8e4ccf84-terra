import postgres from "postgres";
import {drizzle} from "drizzle-orm/postgres-js";
import {env} from "../lib/env";

const globalDb = globalThis as unknown as {
  workspaceSql?: ReturnType<typeof postgres>;
};

export function db() {
  globalDb.workspaceSql ??= postgres(env().DATABASE_URL, {
    max: 5,
    connect_timeout: 5,
  });
  return drizzle(globalDb.workspaceSql);
}

export async function closeDatabase() {
  await globalDb.workspaceSql?.end();
  delete globalDb.workspaceSql;
}
