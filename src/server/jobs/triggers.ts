import type { JobPayload, JobRecord, JobStore } from "./types";

export interface InputEvent {
  id: string;
  kind: "weather" | "observation";
  availableAt: string;
  weatherRunId?: string;
}

/** Durable uniqueness lives in JobStore.enqueue; eligibility is a deterministic code gate. */
export async function triggerInput(store: JobStore, payload: Omit<JobPayload, "eventKey">,
  event: InputEvent, now: string, maxAttempts = 3): Promise<JobRecord> {
  if (!event.id || payload.dataPolicy !== "history_only" || !payload.configVersion ||
      !payload.assetIds.length || new Set(payload.assetIds).size !== payload.assetIds.length ||
      ![24, 48].includes(payload.horizonHours) ||
      !Number.isFinite(Date.parse(event.availableAt)) ||
      !Number.isFinite(Date.parse(now)) || !Number.isFinite(Date.parse(payload.issuedAt)) ||
      Date.parse(event.availableAt) > Date.parse(now) ||
      Date.parse(event.availableAt) > Date.parse(payload.issuedAt)) {
    throw new Error("EVENT_NOT_AVAILABLE");
  }
  if (event.kind === "weather" && !event.weatherRunId) throw new Error("MISSING_WEATHER_RUN");
  const eventKey = `${payload.mode}:${[...payload.assetIds].sort().join(",")}:${payload.issuedAt}:` +
    `${payload.horizonHours}:${payload.modelVersionId}:${payload.configVersion}:${event.kind}:${event.id}`;
  const next: JobPayload = { ...payload, eventKey,
    weatherRunId: event.kind === "weather" ? event.weatherRunId : payload.weatherRunId };
  return store.enqueue(eventKey, next, now, maxAttempts);
}
