import {api, requireSameOrigin} from "@/src/lib/api";
import {jsonResponse} from "@/src/lib/json";
import {industrialActionSchema, industrialKindSchema} from "@/src/server/connectors/industrial/contracts";
import {runIndustrialAction} from "@/src/server/connectors/industrial/gateway";

export const runtime = "nodejs";

export async function POST(request: Request, context: {params: Promise<{kind: string}>}) {
  return api(async () => {
    requireSameOrigin(request);
    const {kind: rawKind} = await context.params;
    const kind = industrialKindSchema.parse(rawKind);
    const action = industrialActionSchema.parse(await request.json());
    return jsonResponse(await runIndustrialAction(kind, action));
  });
}
