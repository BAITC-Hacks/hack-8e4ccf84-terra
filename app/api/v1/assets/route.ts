import { z } from "zod";
import { database } from "@/src/server/db/client";
import { apiError } from "@/src/server/auth/response";

export const dynamic = "force-dynamic";

const assetInput = z.object({
  kind: z.enum(["station", "turbine", "line"]),
  name: z.string().trim().min(1).max(200),
  station_id: z.uuid().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  time_zone: z.string().min(1).nullable().optional(),
  power_unit: z.string().min(1).nullable().optional(),
  power_scale: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();

export async function GET() {
  try {
    const rows = await database()`SELECT id, kind, name, station_id, latitude, longitude, time_zone, power_unit, power_scale FROM assets ORDER BY name, id`;
    return Response.json({ assets: rows });
  } catch { return apiError(503, "DATABASE_UNAVAILABLE", "Assets are temporarily unavailable"); }
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Expected JSON request body"); }
  const parsed = assetInput.safeParse(body);
  if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Invalid asset fields");
  const input = parsed.data;
  try {
    if (input.station_id) {
      const [station] = await database()`SELECT id FROM assets WHERE id = ${input.station_id} AND kind = 'station'`;
      if (!station) return apiError(400, "INVALID_STATION", "station_id must identify a station");
    }
    const [asset] = await database()`INSERT INTO assets
      (kind, name, station_id, latitude, longitude, time_zone, power_unit, power_scale)
      VALUES (${input.kind}, ${input.name}, ${input.station_id ?? null}, ${input.latitude ?? null}, ${input.longitude ?? null}, ${input.time_zone ?? null}, ${input.power_unit ?? null}, ${input.power_scale ? JSON.stringify(input.power_scale) : null}::jsonb)
      RETURNING id, kind, name, station_id, latitude, longitude, time_zone, power_unit, power_scale`;
    return Response.json({ asset }, { status: 201 });
  } catch { return apiError(503, "DATABASE_UNAVAILABLE", "Asset could not be saved"); }
}
