import {z} from "zod";

export const EvaluationResultSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  issues: z.array(z.string()),
  suggestion: z.string().optional(),
});
export const parseEvaluation = (value: unknown) =>
    EvaluationResultSchema.parse(value);
