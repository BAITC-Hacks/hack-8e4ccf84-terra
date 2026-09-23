import { z } from "zod";
import type { JobPayload } from "../jobs/types";

const schema = z.strictObject({
  asset_ids: z.array(z.uuid()).min(1).max(20),
  issued_at: z.iso.datetime({ offset: true }),
  horizon_hours: z.union([z.literal(24), z.literal(48)]),
  mode: z.enum(["live", "backtest", "replay"]),
  model_version: z.union([z.uuid(), z.literal("baseline")]),
  config_version: z.string().trim().min(1).max(100).default("agent-v1"),
  data_policy: z.literal("history_only"),
  weather_run_id: z.uuid().optional(),
});

export function parseAgentRequest(body: unknown, eventKey: string): JobPayload {
  const input = schema.parse(body);
  const issuedAt = new Date(input.issued_at);
  if (issuedAt.getTime() % 3_600_000 !== 0 || new Set(input.asset_ids).size !== input.asset_ids.length) {
    throw new Error("INVALID_AGENT_REQUEST");
  }
  return { assetIds: input.asset_ids, issuedAt: issuedAt.toISOString(), horizonHours: input.horizon_hours,
    mode: input.mode, modelVersionId: input.model_version, configVersion: input.config_version,
    dataPolicy: input.data_policy, eventKey, weatherRunId: input.weather_run_id };
}
