import {api, idSchema, requireSameOrigin} from "@/src/lib/api";
import {jsonResponse} from "@/src/lib/json";
import {csvImportService} from "@/src/server/data/import/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return api(async () => {
    requireSameOrigin(request);
    const form = await request.formData();
    const file = form.get("file");
    const rawConfig = form.get("config");
    if (!(file instanceof File) || typeof rawConfig !== "string")
      return jsonResponse({error: {code: "validation_error", message: "Multipart file and JSON config are required.", retryable: false}}, 400);
    const connectionValue = form.get("connectionId");
    const result = await csvImportService().import({
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
      connectionId: typeof connectionValue === "string" && connectionValue
        ? idSchema.parse(connectionValue)
        : null,
      config: JSON.parse(rawConfig),
    });
    if ("requiresConfirmation" in result) return jsonResponse(result);
    return jsonResponse(Object.fromEntries(
      Object.entries(result).filter(([key]) => key !== "rawPath"),
    ), 201);
  });
}
