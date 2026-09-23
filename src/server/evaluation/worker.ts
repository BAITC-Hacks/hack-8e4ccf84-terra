import {randomUUID} from "node:crypto";
import type postgres from "postgres";
import {z} from "zod";
import type {Observation} from "../contracts";
import {evaluatePublishedPoints, snapshotBaseline, uniquePublishedPoints} from "./published";
import {digest, februaryWindow, semanticManifestSchema, validTimezone} from "./semantics";
import type {EvaluationPoint, EvaluationReport} from "./types";

export const evaluationRequestSchema = z.object({
  forecastRunIds: z.array(z.uuid()).min(1),
  calendarTimezone: z.string().refine(validTimezone),
  manifest: semanticManifestSchema,
}).strict();
export type PublishedEvaluationRequest = z.infer<typeof evaluationRequestSchema>;
export type SavedEvaluation = {report: EvaluationReport; version: number; reused: boolean};
const iso = (value: Date | string) => new Date(value).toISOString();

/** One tick for P6. Evaluate only explicitly selected publications, without invoking inference. */
export async function evaluatePublishedForecasts(sql: ReturnType<typeof postgres>, input: unknown): Promise<SavedEvaluation> {
  const request = evaluationRequestSchema.parse(input);
  request.forecastRunIds = [...new Set(request.forecastRunIds)].sort();
  if (request.manifest.timezone.status === "confirmed" && request.manifest.timezone.value !== request.calendarTimezone) {
    throw new Error("CALENDAR_MANIFEST_MISMATCH");
  }
  const window = februaryWindow(request.calendarTimezone);
  const manifestHash = digest(request.manifest);
  return sql.begin(async (tx) => {
    // Same lock as import: each report sees a complete revision set, never half a batch.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended('p5-evaluation', 0))`;
    const runs = await tx`SELECT f.*, s.payload, s.sha256 FROM forecast_runs f
      JOIN input_snapshots s ON s.id = f.input_snapshot_id
      WHERE f.id = ANY(${tx.array(request.forecastRunIds, 2950)}) ORDER BY f.version DESC, f.id`;
    if (runs.length !== request.forecastRunIds.length || runs.some((r) => r.status !== "published" ||
      !r.published_at || r.data_policy !== "history_only")) throw new Error("PUBLISHED_HISTORY_FORECASTS_REQUIRED");
    if (new Set(runs.map((r) => `${r.mode}/${r.horizon_hours}/${r.model_version_id}`)).size !== 1) {
      throw new Error("MIXED_FORECAST_COHORT");
    }
    if (runs.some((r) => !r.asset_ids.length || new Set(r.asset_ids).size !== r.asset_ids.length)) {
      throw new Error("INVALID_PUBLISHED_ASSETS");
    }
    // For requested revisions of one issue/asset, select highest version, never best metric.
    const selected = new Map<string, typeof runs[number]>();
    for (const run of runs) {
      for (const asset of run.asset_ids as string[]) {
        const key = `${asset}/${iso(run.issued_at)}`;
        const previous = selected.get(key);
        if (previous && previous.version === run.version && previous.id !== run.id) throw new Error("AMBIGUOUS_RELEASE_VERSION");
        if (!previous) selected.set(key, run);
      }
    }
    const values = await tx`SELECT * FROM forecast_values WHERE forecast_run_id = ANY(${tx.array(request.forecastRunIds, 2950)})`;
    const assets = [...new Set([...selected.keys()].map((key) => key.split("/")[0]))].sort();
    // Rank all revisions before matching semantics: a correction cannot resurrect an obsolete value.
    const actualRows = await tx`SELECT DISTINCT ON (a.asset_id, a.target_time)
      a.*, b.manifest_hash FROM evaluation_actuals a JOIN evaluation_actual_batches b ON b.id = a.batch_id
      WHERE a.asset_id = ANY(${tx.array(assets, 2950)}) AND a.target_time >= ${window.start}
        AND a.target_time < ${window.endExclusive}
      ORDER BY a.asset_id, a.target_time, a.revision DESC`;
    const actuals = new Map(actualRows.map((r) => [`${r.asset_id}/${iso(r.target_time)}`, r]));
    const points: EvaluationPoint[] = [];
    const revisionIds: string[] = [];
    const runIds = new Set<string>();
    for (const [key, run] of selected) {
      const assetId = key.split("/")[0];
      const issuedAt = iso(run.issued_at);
      const rows = values.filter((v) => v.forecast_run_id === run.id && v.asset_id === assetId);
      if (rows.length !== run.horizon_hours) throw new Error("INCOMPLETE_PUBLISHED_FORECAST");
      const baselinePrediction = snapshotBaseline((run.payload.observations ?? []) as Observation[], assetId, issuedAt, window.start);
      runIds.add(run.id);
      for (const row of rows) {
        const targetTime = iso(row.target_time);
        const leadHour = (Date.parse(targetTime) - Date.parse(issuedAt)) / 3_600_000;
        if (leadHour > run.horizon_hours) throw new Error("INVALID_PUBLISHED_POINT");
        const actual = actuals.get(`${assetId}/${targetTime}`);
        if (actual) revisionIds.push(actual.id);
        points.push({assetId, issuedAt, targetTime, leadHour, forecastRunId: run.id,
          prediction: Number(row.value), unit: row.unit, baselinePrediction,
          actual: actual && actual.manifest_hash === manifestHash && actual.value !== null ? Number(actual.value) : null});
      }
    }
    const unique = uniquePublishedPoints(points);
    const series = digest({algorithm: "p5-v1", request});
    const provenance = {algorithm: "p5-v1", request, selectedRunIds: [...runIds].sort(),
      actualRevisionIds: [...new Set(revisionIds)].sort(), manifestHash,
      duplicatePolicy: "latest_requested_version_per_asset_issue; all_distinct_issues_and_leads",
      baseline: "persistence_from_frozen_pre_february_snapshot",
      noMetricsReason: unique.some((p) => p.actual !== null) ? null : "no_compatible_actuals",
      incompatibleActualCount: actualRows.filter((r) => r.manifest_hash !== manifestHash).length};
    const fingerprint = digest({series, provenance, points: unique});
    const previous = await tx`SELECT p5_report, p5_version FROM evaluation_runs WHERE p5_fingerprint = ${fingerprint}`;
    if (previous.length) return {report: previous[0].p5_report as EvaluationReport, version: previous[0].p5_version as number, reused: true};
    const [revision] = await tx`SELECT COALESCE(MAX(p5_version), 0) + 1 AS version FROM evaluation_runs WHERE p5_series = ${series}`;
    const report = evaluatePublishedPoints({id: randomUUID(), backtestJobId: series,
      snapshotHash: digest(runs.map((r) => ({id: r.id, hash: r.sha256}))), points: unique,
      evaluationStart: window.start, evaluationEndExclusive: window.endExclusive});
    await tx`INSERT INTO evaluation_runs (id, forecast_run_ids, window_start, window_end, data_policy,
      status, coverage, exclusions, p5_fingerprint, p5_series, p5_version, p5_report, p5_provenance)
      VALUES (${report.id}, ${tx.array([...runIds].sort(), 2950)}, ${window.start}, ${window.endExclusive},
      'evaluation_only', 'completed', ${report.coverage}, ${tx.json(report.exclusions)}, ${fingerprint},
      ${series}, ${revision.version}, ${tx.json(report)}, ${tx.json(provenance)})`;
    for (const slice of report.metrics) {
      for (const [name, value] of [["model", slice.model], ["comparison_model", slice.comparison?.model],
        ["baseline", slice.comparison?.baseline]] as const) {
        for (const metric of ["mae", "rmse"] as const) {
          await tx`INSERT INTO metrics (evaluation_run_id, asset_id, name, value, sample_count, dimensions)
            VALUES (${report.id}, ${slice.assetId}, ${`${name}_${metric}`}, ${value?.[metric] ?? null},
            ${value?.n ?? 0}, ${tx.json({dimension: slice.dimension, leadBucket: slice.leadBucket})})`;
        }
      }
    }
    return {report, version: Number(revision.version), reused: false};
  });
}
