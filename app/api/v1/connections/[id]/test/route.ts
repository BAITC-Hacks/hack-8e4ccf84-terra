import {api, idSchema, requireSameOrigin} from "@/src/lib/api";
import {jsonResponse} from "@/src/lib/json";
import {CsvConnector} from "@/src/server/connectors/csv/connector";
import {connectionRepository} from "@/src/server/data/import/runtime";

export const runtime = "nodejs";

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return api(async () => {
    requireSameOrigin(request);
    const id = idSchema.parse((await context.params).id);
    const connection = await connectionRepository().get(id);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return jsonResponse({error: {code: "validation_error", message: "A CSV file is required.", retryable: false}}, 400);
    const connector = new CsvConnector(
      new Uint8Array(await file.arrayBuffer()),
      connection.config,
    );
    const health = await connector.testConnection();
    await connectionRepository().recordTest(id, health.status === "healthy", health.message);
    return jsonResponse({health, schema: await connector.discoverSchema()});
  });
}
