import {defineTool} from "../../../agent/types";
import {AppError} from "../../../agent/errors";
import {cases} from "../fixtures";
import {CaseInput, CaseSchema} from "../schemas";

export const getCase = defineTool({
  name: "get_case",
  description: "Retrieve a generic workspace case and its supporting facts.",
  inputSchema: CaseInput,
  outputSchema: CaseSchema,
  risk: "read",
  approval: "never",
  async execute({caseId}) {
    const record = cases.find((c) => c.caseId === caseId);
    if (!record)
      throw new AppError(
          "case_not_found",
          "The requested demo case does not exist.",
      );
    return {
      data: record,
      evidence: [
        {
          source: "demo_case",
          label: `Case ${caseId}`,
          excerpt: record.facts.join(" "),
          metadata: {caseId},
        },
      ],
    };
  },
});
