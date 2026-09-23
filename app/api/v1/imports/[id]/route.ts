import {AppError} from "@/src/agent/errors";
import {api, idSchema} from "@/src/lib/api";
import {jsonResponse} from "@/src/lib/json";
import {importRepository} from "@/src/server/data/import/runtime";

export const runtime = "nodejs";

export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  return api(async () => {
    const id = idSchema.parse((await context.params).id);
    const record = await importRepository().get(id);
    if (!record) throw new AppError("not_found", "Import not found.");
    const safeRecord = Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== "rawPath"),
    );
    return jsonResponse({...safeRecord, rawStored: true});
  });
}
