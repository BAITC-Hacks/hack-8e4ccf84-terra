import { database } from "@/src/server/db/client";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await database()`SELECT 1`;
    return Response.json({ status: "ok", database: "ready" });
  } catch {
    return Response.json({ status: "unavailable", database: "unavailable" }, { status: 503 });
  }
}
