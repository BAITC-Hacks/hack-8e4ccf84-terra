import {z} from "zod";

const finite = z.number().refine(Number.isFinite, "must be finite");

export const trainingExampleSchema = z.object({
  timestamp: z.iso.datetime({offset: true}),
  windSpeed: finite.nonnegative(),
  temperature: finite,
  assetId: z.string().trim().min(1).max(200),
  leadHours: finite.nonnegative(),
  target: finite,
});

export const createTrainingJobSchema = z.object({
  cutoff: z.iso.datetime({offset: true}).refine(
    (value) => new Date(value) <= new Date("2026-02-01T00:00:00.000Z"),
    "cutoff must not be later than 2026-02-01T00:00:00Z",
  ),
  examples: z.array(trainingExampleSchema).min(1).max(100_000),
  codeVersion: z.string().trim().min(1).max(200).optional(),
  seed: z.number().int().nonnegative().default(42),
  historyWindows: z.tuple([z.literal(3), z.literal(6), z.literal(12), z.literal("full")])
    .default([3, 6, 12, "full"]),
  ridgeLambdas: z.array(finite.nonnegative()).min(1).max(20).default([0.1, 1, 10]),
});

export type CreateTrainingJobInput = z.infer<typeof createTrainingJobSchema>;
