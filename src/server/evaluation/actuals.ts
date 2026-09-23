import type postgres from "postgres";
import {z} from "zod";
import {assertActualSemantics, digest, februaryWindow, semanticManifestSchema} from "./semantics";

export const utcHour = z.string().refine((s) => Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString() === s && Date.parse(s) % 3_600_000 === 0, "Canonical UTC whole hour required");
const actualBundleSchema = z.object({
  source: z.string().min(1), sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  manifest: semanticManifestSchema,
  rows: z.array(z.object({assetId: z.uuid(), targetTime: utcHour,
    value: z.number().finite().nullable(), unit: z.literal("normalized")}).strict()).min(1),
}).strict();
export type ActualBundle = z.infer<typeof actualBundleSchema>;

export function prepareActuals(input: unknown) {
  const bundle = actualBundleSchema.parse(input);
  assertActualSemantics(bundle.manifest);
  if (bundle.manifest.timezone.status !== "confirmed" || bundle.manifest.mapping.status !== "confirmed") {
    throw new Error("ACTUAL_SEMANTICS_UNCONFIRMED");
  }
  const window = februaryWindow(bundle.manifest.timezone.value);
  const assets = new Set(bundle.manifest.mapping.value.map((row) => row.assetId));
  const unique = new Map<string, ActualBundle["rows"][number]>();
  for (const row of bundle.rows) {
    if (!assets.has(row.assetId)) throw new Error("UNMAPPED_ACTUAL_ASSET");
    if (row.targetTime < window.start || row.targetTime >= window.endExclusive) throw new Error("ACTUAL_OUTSIDE_FEBRUARY");
    const key = `${row.assetId}/${row.targetTime}`;
    if (unique.has(key) && unique.get(key)!.value !== row.value) throw new Error("CONFLICTING_ACTUAL_DUPLICATE");
    unique.set(key, row);
  }
  bundle.rows = [...unique.values()].sort((a, b) => a.assetId.localeCompare(b.assetId) || a.targetTime.localeCompare(b.targetTime));
  return {bundle, fingerprint: digest(bundle), manifestHash: digest(bundle.manifest)};
}

/** Insert-only, atomic and idempotent. No access to the training observation tables. */
export async function importEvaluationActuals(sql: ReturnType<typeof postgres>, input: unknown) {
  const {bundle, fingerprint, manifestHash} = prepareActuals(input);
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended('p5-evaluation', 0))`;
    const existing = await tx`SELECT id FROM evaluation_actual_batches WHERE fingerprint = ${fingerprint}`;
    if (existing.length) return {batchId: existing[0].id as string, imported: false, rowCount: bundle.rows.length};
    const [batch] = await tx`INSERT INTO evaluation_actual_batches
      (fingerprint, source, source_sha256, manifest, manifest_hash)
      VALUES (${fingerprint}, ${bundle.source}, ${bundle.sourceSha256},
        ${tx.json(bundle.manifest)}, ${manifestHash}) RETURNING id`;
    for (const row of bundle.rows) {
      await tx`INSERT INTO evaluation_actuals (batch_id, asset_id, target_time, revision, value, unit)
        SELECT ${batch.id}, ${row.assetId}, ${row.targetTime}, COALESCE(MAX(revision), 0) + 1,
          ${row.value}, 'normalized' FROM evaluation_actuals
        WHERE asset_id = ${row.assetId} AND target_time = ${row.targetTime}`;
    }
    return {batchId: batch.id as string, imported: true, rowCount: bundle.rows.length};
  });
}
