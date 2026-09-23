import type { Clock } from "../jobs/runner";
import { triggerInput, type InputEvent } from "../jobs/triggers";
import type { JobPayload, JobRecord, JobStore } from "../jobs/types";

export class VirtualClock implements Clock {
  constructor(private current: string) {
    if (!Number.isFinite(Date.parse(current))) throw new Error("INVALID_TIME");
  }
  now(): string { return this.current; }
  advance(to: string): void {
    if (!Number.isFinite(Date.parse(to)) || Date.parse(to) < Date.parse(this.current)) throw new Error("TIME_REVERSAL");
    this.current = to;
  }
}

export interface ReplayEvent extends InputEvent { issuedAt: string }

/** Reveals events in availability order and isolates every replay job by mode. */
export async function revealReplayEvents(store: JobStore, clock: VirtualClock,
  request: Omit<JobPayload, "eventKey" | "issuedAt" | "mode">, events: ReplayEvent[]): Promise<JobRecord[]> {
  const due = events.filter((event) => Date.parse(event.availableAt) <= Date.parse(clock.now()))
    .sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt));
  const jobs: JobRecord[] = [];
  for (const event of due) {
    jobs.push(await triggerInput(store, { ...request, issuedAt: event.issuedAt, mode: "replay" }, event, clock.now()));
  }
  return jobs;
}
