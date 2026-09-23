import {Agent} from "@openai/agents";
import {type AgentContext, AgentResultSchema, type DomainConfig,} from "./types";
import {type ToolRuntime, wrapTool} from "./tool";

export function createAgent(
    domain: DomainConfig,
    model: string,
    runtime: ToolRuntime,
) {
  return new Agent<AgentContext, typeof AgentResultSchema>({
    name: domain.agentName,
    model,
    instructions: `${domain.instructions}\nNever invent evidence IDs. Only reference evidence IDs returned by tools. Use tools when external facts are required. Stop when sufficient evidence exists. If the objective cannot be completed safely, return outcome=blocked. Do not expose private chain-of-thought. Keep the final summary concise and evidence-grounded.`,
    tools: domain.tools.map((t) => wrapTool(t, runtime)),
    outputType: AgentResultSchema,
    modelSettings: {parallelToolCalls: false},
  });
}
