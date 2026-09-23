import {api, requireSameOrigin} from "@/src/lib/api";
import {jsonResponse} from "@/src/lib/json";
import {probeWeather} from "@/src/server/connectors/weather/probe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return api(async () => {
    requireSameOrigin(request);
    return jsonResponse(await probeWeather(await request.json()));
  });
}
