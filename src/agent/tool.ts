import {type FunctionTool, tool} from "@openai/agents";
import {z} from "zod";
import type {AgentContext, AgentLimits, DomainTool, ToolExecutionContext,} from "./types";
import {EvidenceDraftSchema} from "./types";
import type {Repository} from "../db/repositories/runs";
import type {EventRecord} from "./events";
import {fingerprint} from "../lib/json";
import {AppError, LoopDetectedError, normalizeError, ToolBudgetExceededError,} from "./errors";
import {withRetry, withTimeout} from "./retry";
import {redact} from "./redact";

export function toolRuntime(
    context: AgentContext,
    limits: AgentLimits,
    signal: AbortSignal,
    store: Repository,
    history: EventRecord[],
) {
  const attempts = history.filter((e) => e.kind === "tool.requested");
  return {
    context,
    limits,
    signal,
    store,
    calls: attempts.length,
    fingerprints: new Map<string, number>(
        attempts.map((e) => [
          String(e.data.fingerprint),
          attempts.filter((a) => a.data.fingerprint === e.data.fingerprint)
              .length,
        ]),
    ),
    prepared: new Map<string, Promise<unknown>>(
        attempts
        .filter((e) => e.data.attempt === 1)
        .map((e) => [String(e.data.toolCallId), Promise.resolve(undefined)]),
    ),
    executed: new Set(
        history
        .filter((e) => e.kind === "tool.succeeded")
        .map((e) => String(e.data.toolCallId)),
    ),
  };
}

export type ToolRuntime = ReturnType<typeof toolRuntime>;

export function wrapTool(definition: DomainTool, runtime: ToolRuntime) {
  const {context, limits, signal, store} = runtime;
  const executionContext = (callId: string): ToolExecutionContext => ({
    ...context,
    signal,
    toolCallId: callId,
  });

  async function failed(error: unknown, callId: string, durationMs: number) {
    if (signal.aborted) return;
    await store.append(context.runId, {
      kind: "tool.failed",
      summary: `${definition.name} failed`,
      data: {
        toolName: definition.name,
        toolCallId: callId,
        durationMs,
        ...normalizeError(error),
      },
    });
  }

  async function attempt(input: unknown, callId: string, number: number) {
    signal.throwIfAborted();
    const parsed = definition.inputSchema.safeParse(input);
    const hash = fingerprint(
        definition.name,
        parsed.success ? parsed.data : input,
    );
    runtime.calls++;
    const repeats = (runtime.fingerprints.get(hash) ?? 0) + 1;
    runtime.fingerprints.set(hash, repeats);
    await store.append(context.runId, {
      kind: "tool.requested",
      summary: `Requested ${definition.name}`,
      data: {
        toolName: definition.name,
        toolCallId: callId,
        arguments: input,
        fingerprint: hash,
        attempt: number,
      },
    });
    if (runtime.calls > limits.maxToolCalls)
      throw new ToolBudgetExceededError();
    if (repeats > limits.maxIdenticalToolCalls) throw new LoopDetectedError();
    if (!parsed.success) throw parsed.error;
    return parsed.data;
  }

  async function prepare(input: unknown, callId: string) {
    if (!runtime.prepared.has(callId))
      runtime.prepared.set(
          callId,
          attempt(input, callId, 1).catch(async (error) => {
            await failed(error, callId, 0);
            throw error;
          }),
      );
    await runtime.prepared.get(callId);
    return definition.inputSchema.parse(input);
  }

  const sdkTool = tool({
    name: definition.name,
    description: definition.description,
    // JSON schema advertises the contract; application Zod validation owns failures.
    parameters: z.toJSONSchema(
        definition.inputSchema,
    ) as FunctionTool["parameters"] & { additionalProperties: false },
    strict: true,
    errorFunction: null,
    needsApproval: async (_context, input, callId) => {
      const id = callId ?? crypto.randomUUID();
      const parsed = await prepare(input, id);
      return withTimeout(
          async (localSignal) => {
            if (definition.risk === "irreversible") return true;
            return typeof definition.approval === "function"
                ? definition.approval(parsed, {
                  ...executionContext(id),
                  signal: localSignal,
                })
                : definition.approval === "always";
          },
          definition.timeoutMs ?? limits.toolTimeoutMs,
          signal,
      );
    },
    execute: async (input, _sdkContext, details) => {
      const callId = details?.toolCall?.callId ?? crypto.randomUUID();
      const parsed = await prepare(input, callId);
      if (runtime.executed.has(callId))
        throw new AppError(
            "duplicate_execution",
            "This action already executed.",
        );
      // SDK enforces approval before invoking this callback. Never approve globally.
      return withRetry(
          async (number) => {
            const started = Date.now();
            try {
              if (number > 1) await attempt(parsed, callId, number);
              const result = await withTimeout(
                  (localSignal) =>
                      definition.execute(parsed, {
                        ...executionContext(callId),
                        signal: localSignal,
                      }),
                  definition.timeoutMs ?? limits.toolTimeoutMs,
                  signal,
              );
              signal.throwIfAborted();
              const data = definition.outputSchema.parse(result.data);
              const evidence = z
              .array(EvidenceDraftSchema)
              .parse(result.evidence ?? []);
              const evidenceRefs: string[] = [];
              for (const draft of evidence) {
                const item = await store.append(context.runId, {
                  kind: "evidence.added",
                  summary: draft.label,
                  data: draft,
                });
                evidenceRefs.push(item.id);
              }
              await store.append(context.runId, {
                kind: "tool.succeeded",
                summary: `${definition.name} completed`,
                data: {
                  toolName: definition.name,
                  toolCallId: callId,
                  durationMs: Date.now() - started,
                  evidenceRefs,
                  resultPreview: data,
                },
              });
              runtime.executed.add(callId);
              return {data: redact(data), evidenceRefs};
            } catch (error) {
              await failed(error, callId, Date.now() - started);
              throw error;
            }
          },
          definition,
          signal,
      );
    },
  });
  // Cover direct invocation too: SDK approval parsing normally calls prepare first.
  const invoke = sdkTool.invoke;
  sdkTool.invoke = async (runContext, raw, details) => {
    const call = details?.toolCall ?? {
      type: "function_call" as const,
      name: definition.name,
      arguments: raw,
      callId: crypto.randomUUID(),
    };
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* Persist invalid input through the same Zod boundary. */
    }
    await prepare(parsed, call.callId);
    return invoke(runContext, raw, {...details, toolCall: call});
  };
  return sdkTool;
}
