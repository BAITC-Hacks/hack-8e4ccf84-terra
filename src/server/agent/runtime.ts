import { database } from "../db/client";
import { JobRunner } from "../jobs/runner";
import { PostgresJobStore } from "../jobs/postgres-store";
import { PostgresAgentPorts } from "./adapters";
import { OpenAiWindAdapter } from "./openai";
import { loadAgentConfig } from "./schemas";
import type { ForecastInference } from "../forecast/inference";
import type {TriggerSnapshotReader} from "./pinned-inputs";
import {readTriggerSnapshot} from "../triggers";

let cached: ReturnType<typeof createRuntime> | undefined;

export function createRuntime(inference?: ForecastInference, triggerSnapshots?: TriggerSnapshotReader) {
  const config = loadAgentConfig();
  const sql = database();
  const store = new PostgresJobStore(sql);
  const llm = config.llmEnabled ? new OpenAiWindAdapter(config) : undefined;
  const ports = new PostgresAgentPorts(sql, process.env.FORECAST_CONFIG_VERSION || "agent-v1",
    llm?.decide, llm?.explain, inference, triggerSnapshots ?? (key => readTriggerSnapshot(sql, key)));
  return { config, store, ports,
    runner: new JobRunner(store, ports, undefined, { leaseMs: config.leaseMs,
      heartbeatMs: config.heartbeatMs, tickBudgetMs: config.tickBudgetMs,
      retryBaseMs: Number(process.env.AGENT_RETRY_BASE_MS ?? 1_000) }) };
}

export function agentRuntime() { return (cached ??= createRuntime()); }
