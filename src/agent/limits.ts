import {z} from "zod";
import type {AgentLimits} from "./types";

export const defaultLimits: AgentLimits = {
  maxTurns: 8,
  maxToolCalls: 12,
  maxIdenticalToolCalls: 2,
  toolTimeoutMs: 15_000,
  activeSegmentTimeoutMs: 90_000,
};
const positive = z.number().int().positive();
export const LimitsSchema = z.object({
  maxTurns: positive,
  maxToolCalls: positive,
  maxIdenticalToolCalls: positive,
  toolTimeoutMs: positive,
  activeSegmentTimeoutMs: positive,
});

export function resolveLimits(overrides?: Partial<AgentLimits>): AgentLimits {
  return LimitsSchema.parse({...defaultLimits, ...overrides});
}
