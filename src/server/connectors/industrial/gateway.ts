import {AppError} from "../../../agent/errors";
import {
  industrialActionSchema,
  industrialGatewayResponseSchema,
  type IndustrialAction,
  type IndustrialGatewayResponse,
  type IndustrialKind,
} from "./contracts";

type GatewayConfig = {baseUrl: string; token: string};

function configuredGateway(kind: IndustrialKind): GatewayConfig {
  const prefix = kind.toUpperCase();
  const baseUrl = process.env[`${prefix}_CONNECTOR_GATEWAY_URL`]?.trim();
  const token = process.env[`${prefix}_CONNECTOR_TOKEN`]?.trim();
  if (!baseUrl || !token || token.startsWith("replace-with-")) {
    throw new AppError("not_configured", "Connector gateway is not configured.");
  }
  return {baseUrl: baseUrl.replace(/\/$/, ""), token};
}

export async function runIndustrialAction(
  kind: IndustrialKind,
  input: IndustrialAction,
  fetchImpl: typeof fetch = fetch,
  config: GatewayConfig = configuredGateway(kind),
): Promise<IndustrialGatewayResponse> {
  const action = industrialActionSchema.parse(input);
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/v1/${kind}/${action.action}`, {
      method: "POST",
      headers: {"content-type": "application/json", authorization: `Bearer ${config.token}`},
      body: JSON.stringify(action.action === "enable" ? action : {action: action.action}),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new AppError("connector_unavailable", `${kind === "oracle" ? "Oracle" : "Siemens WinCC"} gateway is unavailable.`);
  }
  if (!response.ok) {
    throw new AppError("connector_unavailable", `${kind === "oracle" ? "Oracle" : "Siemens WinCC"} gateway rejected the request (HTTP ${response.status}).`);
  }
  const body: unknown = await response.json().catch(() => null);
  const parsed = industrialGatewayResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.action !== action.action) {
    throw new AppError("invalid_connector_response", "Connector gateway returned an invalid response.");
  }
  return parsed.data;
}
