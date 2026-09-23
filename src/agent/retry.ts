import {setTimeout as delay} from "node:timers/promises";
import {RetryableToolError, ToolTimeoutError} from "./errors";
import type {ToolRisk} from "./types";

export function mayRetry(
    risk: ToolRisk,
    idempotent: boolean | undefined,
    error: unknown,
) {
  return (
      (risk === "read" || (risk === "write" && idempotent === true)) &&
      (error instanceof RetryableToolError || error instanceof ToolTimeoutError)
  );
}

export async function withRetry<T>(
    operation: (attempt: number) => Promise<T>,
    policy: { risk: ToolRisk; idempotent?: boolean },
    signal: AbortSignal,
): Promise<T> {
  try {
    return await operation(1);
  } catch (error) {
    if (signal.aborted || !mayRetry(policy.risk, policy.idempotent, error))
      throw error;
    await delay(200 + Math.floor(Math.random() * 100), undefined, {signal});
    return operation(2);
  }
}

export async function withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    ms: number,
    parent: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const signal = AbortSignal.any([parent, controller.signal]);
  const timer = setTimeout(() => controller.abort(new ToolTimeoutError()), ms);
  let abort: () => void = () => {
  };
  try {
    signal.throwIfAborted();
    return await Promise.race([
      operation(signal),
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, {once: true});
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
