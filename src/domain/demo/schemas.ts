import {z} from "zod";

export const CaseInput = z.object({
  caseId: z.string().trim().toUpperCase().min(1),
});
export const CaseSchema = z.object({
  caseId: z.string(),
  request: z.string(),
  status: z.string(),
  facts: z.array(z.string()),
  eligible: z.boolean(),
});
export const GuidanceSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
});
export const ActionInput = z.object({
  caseId: z.string().trim().toUpperCase().min(1),
  action: z.enum(["mark_ready"]),
  rationale: z.string().min(1).max(1000),
});
