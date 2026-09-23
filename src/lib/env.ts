import {z} from "zod";

export const DEFAULT_MODEL = "gpt-5.6-terra";
const schema = z.object({
  DATABASE_URL: z.url(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default(DEFAULT_MODEL),
  ARTIFACT_ROOT: z.string().min(1).default(".data/artifacts"),
  IMPORT_BATCH_SIZE: z.coerce.number().int().positive().max(10_000).default(500),
});

// Lazy validation lets builds and offline tests run without runtime secrets.
export function env(requireKey = false) {
  const value = schema.parse({
    ...process.env,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
  });
  if (requireKey && !value.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is required to execute an agent.");
  return value;
}
