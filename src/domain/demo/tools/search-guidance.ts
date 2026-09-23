import {z} from "zod";
import {defineTool} from "../../../agent/types";
import {guidance} from "../fixtures";
import {GuidanceSchema} from "../schemas";

export const searchGuidance = defineTool({
  name: "search_guidance",
  description:
      "Search deterministic guidance for case readiness, approval, and missing information.",
  inputSchema: z.object({query: z.string().trim().min(1).max(500)}),
  outputSchema: z.array(GuidanceSchema),
  risk: "read",
  approval: "never",
  async execute({query}) {
    const words = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
    const found = guidance.filter((g) =>
        words.some((w) => `${g.title} ${g.text}`.toLowerCase().includes(w)),
    );
    return {
      data: found,
      evidence: found.map((g) => ({
        source: "demo_guidance",
        label: g.title,
        excerpt: g.text,
        metadata: {documentId: g.id},
      })),
    };
  },
});
