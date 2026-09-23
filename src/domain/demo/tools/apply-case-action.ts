import {z} from "zod";
import {defineTool} from "../../../agent/types";
import {AppError} from "../../../agent/errors";
import {cases} from "../fixtures";
import {ActionInput} from "../schemas";

export const applyCaseAction = defineTool({
  name: "apply_case_action",
  description:
      "Simulate mark_ready for an eligible case. Always requires human approval. No external system is changed.",
  inputSchema: ActionInput,
  outputSchema: z.object({
    applied: z.literal(true),
    simulated: z.literal(true),
    caseId: z.string(),
    action: z.string(),
  }),
  risk: "write",
  approval: "always",
  async execute({caseId, action}, context) {
    context.signal.throwIfAborted();
    if (!cases.find((c) => c.caseId === caseId)?.eligible)
      throw new AppError(
          "business_rule_rejected",
          "This case does not meet readiness requirements.",
      );
    return {
      data: {
        applied: true as const,
        simulated: true as const,
        caseId,
        action,
      },
      evidence: [
        {
          source: "demo_action",
          label: "Simulated action applied",
          excerpt: `${caseId}: ${action}. No external system was changed.`,
        },
      ],
    };
  },
});
