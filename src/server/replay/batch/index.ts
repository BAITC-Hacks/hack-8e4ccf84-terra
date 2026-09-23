import { createHash } from "node:crypto";
import { z } from "zod";
import { payloadFingerprint, type JobPayload, type JobStore } from "../../jobs/types";
import type { ForecastInputSnapshot } from "../../data/snapshot/build";
import { validateForecastValues, type StoredForecast } from "../../forecast/service";

export const BatchConfigSchema = z.strictObject({
  assetIds: z.array(z.uuid()).length(2).refine(v => new Set(v).size === 2),
  modelVersionId: z.uuid(), configVersion: z.string().min(1).max(100).default("agent-v1"),
  timezone: z.string().min(1), issueHour: z.number().int().min(0).max(23),
  from: z.iso.date().default("2026-01-31"), to: z.iso.date().default("2026-02-28"),
  mode: z.enum(["replay", "backtest"]),
});
export type BatchConfig = z.infer<typeof BatchConfigSchema>;
export type InputVersions = Pick<ForecastInputSnapshot, "weatherRunIds" | "observationRevisions">;
export interface Preflight { versions: InputVersions; missing: string[] }
export interface Release {
  request: JobPayload; preflight?: Preflight; jobId?: string; forecastId?: string;
  status: "pending" | "ready" | "running" | "completed" | "missing" | "failed" | "timeout" | "cancelled";
  reason?: string; snapshotId?: string; snapshotHash?: string;
}
export interface Manifest {
  schemaVersion: 1; id: string; synthetic: boolean; officialResult: false;
  config: BatchConfig; releases: Release[];
}
export interface BatchAdapter {
  synthetic: boolean;
  jobs: Pick<JobStore, "enqueue" | "get" | "cancel">;
  preflight(request: JobPayload): Promise<Preflight>;
  forecast(id: string, request: JobPayload): Promise<StoredForecast | null>;
}
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const versionKey = (v: InputVersions) => digest({
  weatherRunIds: [...v.weatherRunIds].sort(),
  observationRevisions: [...v.observationRevisions].sort((a,b) => a.observationId.localeCompare(b.observationId)),
});

/** Calendar is explicitly IANA-based. Ambiguous/nonexistent/non-UTC-hour issues are rejected. */
export function issueTimes(config: BatchConfig): string[] {
  const c = BatchConfigSchema.parse(config);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: c.timezone, year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const first = Date.parse(c.from), last = Date.parse(c.to);
  if (first > last || last - first > 366 * 86400000) throw new Error("INVALID_RANGE");
  const times: string[] = [];
  for (let day = first; day <= last; day += 86400000) {
    const date = new Date(day).toISOString().slice(0,10);
    const matches: string[] = [];
    for (let t = day - 18 * 3600000; t <= day + 42 * 3600000; t += 3600000) {
      const p = Object.fromEntries(formatter.formatToParts(t).map(p => [p.type, p.value]));
      if (`${p.year}-${p.month}-${p.day}` === date && Number(p.hour) === c.issueHour && p.minute === "00") {
        matches.push(new Date(t).toISOString());
      }
    }
    if (matches.length !== 1) throw new Error(`UNSUPPORTED_OR_AMBIGUOUS_ISSUE_TIME:${date}`);
    times.push(matches[0]);
  }
  return times;
}
export function createManifest(input: BatchConfig, synthetic = false): Manifest {
  const config = BatchConfigSchema.parse(input);
  config.assetIds.sort();
  const id = digest({ config, synthetic });
  const releases: Release[] = [];
  for (const issuedAt of issueTimes(config)) for (const assetId of config.assetIds) {
    for (const horizonHours of [24,48] as const) releases.push({ status: "pending", request: {
      assetIds: [assetId], issuedAt, horizonHours, mode: config.mode, modelVersionId: config.modelVersionId,
      configVersion: config.configVersion, dataPolicy: "history_only", eventKey: "",
    }});
  }
  return { schemaVersion: 1, id, synthetic, officialResult: false, config, releases };
}

export async function runBatch(manifest: Manifest, adapter: BatchAdapter,
  save: (manifest: Manifest) => Promise<void>, options: { maxPolls?: number; pollMs?: number;
    signal?: AbortSignal; sleep?: (ms: number) => Promise<void> } = {}): Promise<Manifest> {
  const maxPolls = options.maxPolls ?? 300, pollMs = options.pollMs ?? 1000;
  if (!Number.isInteger(maxPolls) || maxPolls < 1 || maxPolls > 3600 ||
    !Number.isInteger(pollMs) || pollMs < 0 || pollMs > 60000) throw new Error("INVALID_POLL_LIMITS");
  const expected = createManifest(manifest.config, adapter.synthetic);
  if (expected.id !== manifest.id || manifest.schemaVersion !== 1 || manifest.synthetic !== adapter.synthetic ||
    expected.releases.length !== manifest.releases.length || manifest.releases.some((r,i) =>
      JSON.stringify({...r.request, eventKey: "", weatherRunId: undefined}) !==
      JSON.stringify(expected.releases[i].request))) throw new Error("MANIFEST_MISMATCH");
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  // Preflight the entire requested range before any job is submitted. Saved selections are immutable on resume.
  for (const release of manifest.releases) {
    if (options.signal?.aborted) { await save(manifest); return manifest; }
    if (release.status !== "pending") continue;
    release.preflight = await adapter.preflight(release.request);
    if (release.preflight.missing.length) {
      release.status = "missing"; release.reason = release.preflight.missing.join(",");
    } else {
      if (release.preflight.versions.weatherRunIds.length !== 1) throw new Error("EXPECTED_ONE_WEATHER_RUN");
      release.request.weatherRunId = release.preflight.versions.weatherRunIds[0];
      release.request.eventKey = `batch:${digest({ ...release.request,
        versions: versionKey(release.preflight.versions), synthetic: manifest.synthetic })}`;
      release.status = "ready";
    }
    await save(manifest);
  }
  for (const release of manifest.releases) {
    if (options.signal?.aborted) { await save(manifest); break; }
    if (!["ready", "running", "timeout"].includes(release.status)) continue;
    // Persisted intent + store idempotency recover crashes between enqueue and manifest write.
    const job = release.jobId ? await adapter.jobs.get(release.jobId) :
      await adapter.jobs.enqueue(release.request.eventKey, release.request, new Date().toISOString(), 3);
    if (!job) throw new Error("JOB_NOT_FOUND");
    if (payloadFingerprint(job.payload) !== payloadFingerprint(release.request)) throw new Error("JOB_PAYLOAD_MISMATCH");
    release.jobId = job.id; release.status = "running"; delete release.reason;
    await save(manifest);
    for (let poll = 0; poll < maxPolls; poll++) {
      const state = options.signal?.aborted
        ? await adapter.jobs.cancel(job.id, new Date().toISOString()) : await adapter.jobs.get(job.id);
      if (!state) throw new Error("JOB_NOT_FOUND");
      if (state.status === "completed") {
        const forecast = state.resultId ? await adapter.forecast(state.resultId, release.request) : null;
        if (!forecast || forecast.id !== state.resultId || forecast.status !== "published" ||
          forecast.request.issuedAt !== release.request.issuedAt ||
          forecast.request.mode !== release.request.mode ||
          forecast.request.horizonHours !== release.request.horizonHours ||
          forecast.request.modelVersionId !== release.request.modelVersionId ||
          forecast.snapshot.configVersion !== release.request.configVersion ||
          versionKey(forecast.snapshot) !== versionKey(release.preflight!.versions) ||
          validateForecastValues(release.request, forecast.values).length) {
          release.status = "failed"; release.reason = "FORECAST_OR_INPUT_VERSION_MISMATCH";
        } else {
          release.status = "completed"; release.forecastId = forecast.id;
          release.snapshotId = forecast.inputSnapshotId; release.snapshotHash = forecast.snapshot.sha256;
        }
        break;
      }
      if (state.status === "failed" || state.status === "cancelled") {
        release.status = state.status; release.reason = state.errorCode ?? state.status; break;
      }
      if (options.signal?.aborted) { release.reason = "CANCEL_PENDING_PUBLICATION"; break; }
      if (poll + 1 === maxPolls) { release.status = "timeout"; release.reason = "POLL_LIMIT"; break; }
      await sleep(pollMs);
    }
    await save(manifest);
    if (release.status === "timeout" || release.status === "running") break;
  }
  return manifest;
}

/** Export only the exact canonical forecast IDs recorded in the manifest, never latest-by-date. */
export async function exportBatch(manifest: Manifest, adapter: BatchAdapter) {
  const rows = [];
  const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: manifest.config.timezone,
    year: "numeric", month: "2-digit" });
  for (const release of manifest.releases.filter(r => r.status === "completed")) {
    const forecast = await adapter.forecast(release.forecastId!, release.request);
    if (!forecast || forecast.snapshot.sha256 !== release.snapshotHash) throw new Error("EXPORT_FORECAST_MISSING_OR_CHANGED");
    for (const point of forecast.values) {
      const date = Object.fromEntries(calendar.formatToParts(new Date(point.targetTime)).map(p => [p.type,p.value]));
      rows.push({ ...point, forecastId: forecast.id, issuedAt: forecast.request.issuedAt,
        lead: (Date.parse(point.targetTime) - Date.parse(forecast.request.issuedAt)) / 3600000,
        horizonHours: forecast.request.horizonHours, modelVersionId: forecast.request.modelVersionId,
        mode: forecast.request.mode, weatherProvenance: forecast.snapshot.weatherRuns,
        inputSnapshotId: forecast.inputSnapshotId, snapshotHash: forecast.snapshot.sha256,
        inFebruaryEvaluation: date.year === "2026" && date.month === "02", synthetic: manifest.synthetic });
    }
  }
  return { batchId: manifest.id, synthetic: manifest.synthetic, officialResult: false,
    evaluationTimezone: manifest.config.timezone, rows };
}
