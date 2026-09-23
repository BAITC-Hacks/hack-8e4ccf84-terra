export const cases = [
  {
    caseId: "DEMO-001",
    request: "Mark the workspace case ready for completion.",
    status: "open",
    facts: [
      "Required information is complete.",
      "Owner confirmed the requested change.",
      "No unresolved dependencies.",
    ],
    eligible: true,
  },
  {
    caseId: "DEMO-002",
    request: "Mark the workspace case ready for completion.",
    status: "open",
    facts: ["Owner confirmation is missing.", "One dependency is unresolved."],
    eligible: false,
  },
];
export const guidance = [
  {
    id: "GUIDE-01",
    title: "Readiness requirements",
    text: "A case can be marked ready only when required information is complete, the owner confirms the change, and no dependencies remain unresolved.",
  },
  {
    id: "GUIDE-02",
    title: "Evidence and approval",
    text: "Retrieve the case and readiness guidance before proposing mark_ready. A human must approve each action.",
  },
  {
    id: "GUIDE-03",
    title: "Incomplete cases",
    text: "When requirements are missing, leave the case unchanged and identify the missing information.",
  },
];
export const exampleObjective =
    "Review case DEMO-001 against the available guidance. If the evidence supports the requested change, apply the appropriate case action.";
