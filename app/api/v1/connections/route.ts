import {api, requireSameOrigin} from "@/src/lib/api";
import {jsonResponse} from "@/src/lib/json";
import {createConnectionSchema} from "@/src/server/connectors/csv/repository";
import {connectionRepository} from "@/src/server/data/import/runtime";

export const runtime = "nodejs";

export async function GET() {
  return api(async () => jsonResponse({connections: await connectionRepository().list()}));
}

export async function POST(request: Request) {
  return api(async () => {
    requireSameOrigin(request);
    const input = createConnectionSchema.parse(await request.json());
    return jsonResponse(await connectionRepository().create(input), 201);
  });
}
