import {type ModelProvider, Runner, RunState} from "@openai/agents";
import {z} from "zod";
import {type AgentContext, AgentResultSchema, type DomainConfig,} from "./types";
import {LimitsSchema, resolveLimits} from "./limits";
import {createAgent} from "./agent-factory";
import {toolRuntime} from "./tool";
import {activeRuns, registerRun} from "./runtime";
import {AppError, normalizeError} from "./errors";
import {repository, type Repository} from "../db/repositories/runs";
import {getDomainConfig} from "../domain/config";
import {DEFAULT_MODEL, env} from "../lib/env";
import {fingerprint} from "../lib/json";
import {redact} from "./redact";
import {isTerminal} from "./state";

export const ObjectiveSchema = z.object({
  objective: z.string().trim().min(5).max(5000),
  domainKey: z.string().min(1).default("demo"),
});

function signature(domain: DomainConfig) {
  return fingerprint(domain.key, {
    instructions: domain.instructions,
    agentName: domain.agentName,
    sdk: "0.18.0",
    tools: domain.tools.map((t) => ({
      name: t.name,
      description: t.description,
      risk: t.risk,
      approval: String(t.approval),
      input: z.toJSONSchema(t.inputSchema),
      output: z.toJSONSchema(t.outputSchema),
      implementation: String(t.execute),
    })),
  });
}

export class AgentRunner {
  constructor(
      readonly store: Repository = repository,
      private options: {
        domain?: (key: string) => DomainConfig;
        modelProvider?: ModelProvider;
        offline?: boolean;
      } = {},
  ) {
  }

  private domain(key: string) {
    return (this.options.domain ?? getDomainConfig)(key);
  }

  async create(body: unknown) {
    const input = ObjectiveSchema.parse(body);
    const domain = this.domain(input.domainKey);
    if (!this.options.offline) env(true);
    return this.store.create({
      ...input,
      objective: String(redact(input.objective)),
      model: domain.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
      configSnapshot: {
        limits: resolveLimits(domain.limits),
        signature: signature(domain),
      },
    });
  }

  async execute(id: string) {
    const controller = registerRun(id);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let row = await this.store.get(id);
      if (row.status === "created")
        row = await this.store.transition(id, "created", "running", {
          kind: "run.started",
          summary: "Execution started",
        });
      else if (row.status !== "running" || !row.sdkState)
        throw new AppError(
            "conflict",
            "Run cannot be executed from this state.",
        );
      const domain = this.domain(row.domainKey);
      if (row.configSnapshot.signature !== signature(domain))
        throw new AppError(
            "configuration_changed",
            "The domain changed since this run started. Start a new run.",
        );
      const limits = LimitsSchema.parse(row.configSnapshot.limits);
      timer = setTimeout(
          () =>
              controller.abort(
                  new AppError(
                      "segment_timeout",
                      "The active execution time limit was reached.",
                  ),
              ),
          limits.activeSegmentTimeoutMs,
      );
      const history = await this.store.events(id);
      const context: AgentContext = {runId: id, domainKey: row.domainKey};
      const runtime = toolRuntime(
          context,
          limits,
          controller.signal,
          this.store,
          history,
      );
      const agent = createAgent(domain, row.model, runtime);
      let input: string | RunState<AgentContext, typeof agent> = row.objective;
      if (row.sdkState) {
        input = await RunState.fromString<AgentContext, typeof agent>(
            agent,
            row.sdkState,
        );
        const decisions = await this.store.approvals(id);
        for (const interruption of input.getInterruptions()) {
          if (interruption.rawItem.type !== "function_call")
            throw new AppError(
                "invalid_approval",
                "Unsupported approval type.",
            );
          const callId = interruption.rawItem.callId;
          const decision = decisions.find((a) => a.toolCallId === callId);
          if (!decision || decision.status === "pending")
            throw new AppError(
                "invalid_approval",
                "Approval decision is missing.",
            );
          if (decision.status === "approved") input.approve(interruption);
          else
            input.reject(interruption, {
              message:
                  decision.decisionReason ??
                  "The user rejected this action. Do not perform it.",
            });
        }
      }
      const sdk = new Runner({
        modelProvider: this.options.modelProvider,
        tracingDisabled:
            this.options.offline ||
            process.env.OPENAI_AGENTS_DISABLE_TRACING === "1",
        traceIncludeSensitiveData: false,
        groupId: id,
        traceMetadata: {runId: id, domain: row.domainKey},
        workflowName: "Agent Workspace",
      });
      const result = await sdk.run(agent, input, {
        context,
        maxTurns: limits.maxTurns,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (result.interruptions.length) {
        const pending = result.interruptions.map((item) => {
          if (item.rawItem.type !== "function_call")
            throw new AppError(
                "invalid_approval",
                "Unsupported approval type.",
            );
          return {
            toolCallId: item.rawItem.callId,
            toolName: item.rawItem.name,
            toolArguments: JSON.parse(item.rawItem.arguments) as unknown,
          };
        });
        await this.store.pause(
            id,
            result.state.toString({includeTracingApiKey: false}),
            pending,
        );
      } else {
        const output = AgentResultSchema.parse(result.finalOutput);
        const evidence = new Set(
            (await this.store.events(id))
            .filter((e) => e.kind === "evidence.added")
            .map((e) => e.id),
        );
        if (output.evidenceRefs.some((ref) => !evidence.has(ref)))
          throw new AppError(
              "invalid_evidence",
              "The result referenced evidence that does not exist.",
          );
        await this.store.transition(
            id,
            "running",
            "completed",
            {
              kind: "run.completed",
              summary:
                  output.outcome === "blocked"
                      ? "Completed with a blocked outcome"
                      : "Review completed",
            },
            {result: redact(output)},
        );
      }
    } catch (error) {
      const row = await this.store.get(id);
      if (!isTerminal(row.status)) {
        const safe = normalizeError(
            controller.signal.aborted ? controller.signal.reason : error,
        );
        await this.store.transition(
            id,
            row.status,
            "failed",
            {kind: "run.failed", summary: safe.message, data: safe},
            {error: safe},
        );
        console.error("Agent run failed", {runId: id, ...safe});
      }
    } finally {
      clearTimeout(timer);
      activeRuns.delete(id);
    }
    return this.store.get(id);
  }

  async decide(
      id: string,
      approvalId: string,
      decision: "approve" | "reject",
      reason?: string,
  ) {
    return this.store.decide(id, approvalId, decision, reason);
  }

  async cancel(id: string) {
    const controller = activeRuns.get(id);
    const row = await this.store.cancel(id);
    controller?.abort(new AppError("cancelled", "Execution was cancelled."));
    return row;
  }

  async recover(id: string) {
    const row = await this.store.get(id);
    // Short grace avoids a GET racing the transaction that claims a new segment.
    if (
        row.status === "running" &&
        !activeRuns.has(id) &&
        Date.now() - row.updatedAt.getTime() > 5000
    ) {
      const error = {
        code: "run_interrupted",
        message:
            "The process stopped during execution. Start a new run; actions were not replayed.",
        retryable: false,
      };
      try {
        return await this.store.transition(
            id,
            "running",
            "failed",
            {kind: "run.failed", summary: error.message, data: error},
            {error},
        );
      } catch (failure) {
        if (!(failure instanceof AppError && failure.code === "conflict"))
          throw failure;
      }
    }
    return this.store.get(id);
  }
}

export const agentRunner = new AgentRunner();
