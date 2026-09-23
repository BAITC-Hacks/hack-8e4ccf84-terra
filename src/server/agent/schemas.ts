import { z } from "zod";

export const AgentDecisionSchema = z.strictObject({
  action: z.enum(["use_primary", "use_cached_weather", "use_baseline", "retry_later", "stop"]),
  candidateId: z.string().min(1).nullable(),
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  reasonSummary: z.string().min(1).max(500),
  evidenceRefs: z.array(z.string().min(1)).max(50),
  limitations: z.array(z.string().max(300)).max(20),
  retryAfterSeconds: z.number().int().min(1).max(3600).nullable(),
});
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

const positive = z.coerce.number().int().positive();
export const AgentConfigSchema = z.strictObject({
  llmEnabled: z.boolean(),
  model: z.string().min(1).nullable(),
  reasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]),
  maxTurns: positive.max(8),
  maxToolExecutions: positive.max(16),
  llmTimeoutMs: positive.max(120_000),
  toolTimeoutMs: positive.max(120_000),
  tickBudgetMs: positive.max(120_000),
  leaseMs: positive.max(300_000),
  heartbeatMs: positive.max(60_000),
  maxOutputTokens: positive.max(3_000),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const llmEnabled = env.AGENT_LLM_ENABLED === "true";
  const model = env.OPENAI_MODEL?.trim() || null;
  if (llmEnabled && (!env.OPENAI_API_KEY || !model)) throw new Error("AGENT_LLM_CONFIGURATION_INVALID");
  return AgentConfigSchema.parse({
    llmEnabled, model,
    reasoningEffort: env.OPENAI_REASONING_EFFORT ?? "medium",
    maxTurns: env.AGENT_MAX_TURNS ?? 8,
    maxToolExecutions: env.AGENT_MAX_TOOL_EXECUTIONS ?? 16,
    llmTimeoutMs: env.AGENT_LLM_TIMEOUT_MS ?? 30_000,
    toolTimeoutMs: env.AGENT_TOOL_TIMEOUT_MS ?? 45_000,
    tickBudgetMs: env.AGENT_TICK_BUDGET_MS ?? 60_000,
    leaseMs: env.AGENT_LEASE_MS ?? 90_000,
    heartbeatMs: env.AGENT_HEARTBEAT_MS ?? 15_000,
    maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS ?? 3_000,
  });
}
