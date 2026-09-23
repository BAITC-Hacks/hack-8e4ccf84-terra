import {redact} from "./redact";

export class AppError extends Error {
  constructor(
      public code: string,
      message: string,
      public retryable = false,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidTransitionError extends AppError {
  constructor() {
    super(
        "invalid_transition",
        "This run cannot change to the requested state.",
    );
  }
}

export class ToolBudgetExceededError extends AppError {
  constructor() {
    super("tool_budget_exceeded", "Tool call budget was exceeded.");
  }
}

export class LoopDetectedError extends AppError {
  constructor() {
    super("loop_detected", "Repeated identical tool calls were stopped.");
  }
}

export class ToolTimeoutError extends AppError {
  constructor() {
    super("tool_timeout", "The tool exceeded its time limit.", true);
  }
}

export class RetryableToolError extends AppError {
  constructor() {
    super(
        "transient_tool_failure",
        "The data source is temporarily unavailable.",
        true,
    );
  }
}

export function normalizeError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  // SDK ToolCallError retains the original tool exception in `error`.
  if (
      error instanceof Error &&
      error.name === "ToolCallError" &&
      "error" in error
  )
    return normalizeError(error.error);
  if (error instanceof AppError)
    return {
      code: error.code,
      message: String(redact(error.message)),
      retryable: error.retryable,
    };
  const name = error instanceof Error ? error.name : "";
  const known: Record<string, [string, string]> = {
    MaxTurnsExceededError: [
      "max_turns_exceeded",
      "The agent reached its turn limit.",
    ],
    ModelBehaviorError: [
      "model_behavior",
      "The model returned an invalid response.",
    ],
    ModelTimeoutError: ["model_timeout", "The model exceeded its time limit."],
    ToolTimeoutError: ["tool_timeout", "The tool exceeded its time limit."],
    ZodError: [
      "validation_error",
      "The supplied data did not match the required schema.",
    ],
    AbortError: ["cancelled", "Execution was cancelled."],
  };
  const [code, message] = known[name] ?? [
    "execution_failed",
    "Execution failed. Review the activity and start a new run.",
  ];
  return {code, message, retryable: false};
}
