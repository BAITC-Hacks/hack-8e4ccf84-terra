import {z} from "zod";

export type AgentContext = {
  runId: string;
  domainKey: string;
  actorId?: string;
};
export const AgentResultSchema = z.object({
  outcome: z.enum(["completed", "blocked"]),
  summary: z.string().min(1),
  decision: z.string().nullable(),
  evidenceRefs: z.array(z.uuid()),
  nextActions: z.array(z.string()).max(5),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;
export const EvidenceDraftSchema = z.object({
  source: z.string().min(1),
  label: z.string().min(1),
  excerpt: z.string().optional(),
  uri: z.url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type EvidenceDraft = z.infer<typeof EvidenceDraftSchema>;
export type ToolRisk = "read" | "write" | "irreversible";
export type ToolExecutionContext = AgentContext & {
  signal: AbortSignal;
  toolCallId: string;
};
export type ApprovalRule<T> =
    | "never"
    | "always"
    | ((input: T, context: ToolExecutionContext) => boolean | Promise<boolean>);

export interface DomainTool<
    I extends z.ZodObject = z.ZodObject,
    O extends z.ZodType = z.ZodType,
> {
  name: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  risk: ToolRisk;
  approval: ApprovalRule<z.infer<I>>;
  timeoutMs?: number;
  idempotent?: boolean;

  execute(
      input: z.infer<I>,
      context: ToolExecutionContext,
  ): Promise<{ data: z.infer<O>; evidence?: EvidenceDraft[] }>;
}

// Erase heterogeneous tool generics only after retaining their runtime validators.
export function defineTool<I extends z.ZodObject, O extends z.ZodType>(
    definition: DomainTool<I, O>,
): DomainTool {
  return {
    ...definition,
    approval:
        typeof definition.approval === "function"
            ? (input, context) =>
                (definition.approval as Exclude<ApprovalRule<z.infer<I>>, string>)(
                    definition.inputSchema.parse(input),
                    context,
                )
            : definition.approval,
    execute: (input, context) =>
        definition.execute(definition.inputSchema.parse(input), context),
  };
}

export type DomainConfig = {
  key: string;
  agentName: string;
  instructions: string;
  tools: DomainTool[];
  model?: string;
  limits?: Partial<AgentLimits>;
};
export type AgentLimits = {
  maxTurns: number;
  maxToolCalls: number;
  maxIdenticalToolCalls: number;
  toolTimeoutMs: number;
  activeSegmentTimeoutMs: number;
};
