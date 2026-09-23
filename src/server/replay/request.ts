import { z } from "zod";

export const ReplayRequestSchema = z.strictObject({
  virtual_time: z.iso.datetime({ offset: true }),
  asset_ids: z.array(z.uuid()).min(1).max(20),
  horizon_hours: z.union([z.literal(24), z.literal(48)]),
  model_version: z.union([z.uuid(), z.literal("baseline")]),
  config_version: z.string().min(1).max(100).default("agent-v1"),
  data_policy: z.literal("history_only"),
  events: z.array(z.strictObject({ id: z.string().min(1).max(200),
    available_at: z.iso.datetime({ offset: true }), issued_at: z.iso.datetime({ offset: true }),
    weather_run_id: z.uuid() })).min(1).max(10_000),
});

export const ReplayAdvanceSchema = z.strictObject({ to: z.iso.datetime({ offset: true }) });
