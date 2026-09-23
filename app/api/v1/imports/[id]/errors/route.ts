import {AppError} from "@/src/agent/errors";
import {api, idSchema} from "@/src/lib/api";
import {importRepository} from "@/src/server/data/import/runtime";
import {issuesCsv} from "@/src/server/data/import/service";

export const runtime = "nodejs";

export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  return api(async () => {
    const id = idSchema.parse((await context.params).id);
    if (!await importRepository().get(id)) throw new AppError("not_found", "Import not found.");
    return new Response(issuesCsv(await importRepository().issues(id)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="import-${id}-errors.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
