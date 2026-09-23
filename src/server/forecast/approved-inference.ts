import {createHash} from "node:crypto";
import {readFile, realpath, stat} from "node:fs/promises";
import {isAbsolute, relative, resolve, sep} from "node:path";
import type postgres from "postgres";
import {parseDeployableArtifact, predictApprovedModel} from "../ml/inference";
import {assertApprovedModel, baselineInference, type ForecastInference} from "./inference";

/** The database approval and byte checksum are the trust anchor, not an artifact's self-assertion. */
export function createApprovedInference(sql: ReturnType<typeof postgres>): ForecastInference {
  return async (request, snapshot, model) => {
    assertApprovedModel(request, model);
    if (model.name === "persistence") return baselineInference(request, snapshot, model);
    const rows = await sql`SELECT a.path, a.sha256 FROM model_versions m
      JOIN raw_artifacts a ON a.id = m.artifact_id WHERE m.id = ${model.id}
      AND m.status = 'approved' AND m.artifact_id = ${model.artifactId}
      AND m.version = ${model.version} AND m.code_version = ${model.codeVersion}`;
    if (rows.length !== 1) throw new Error("MODEL_NOT_APPROVED");
    let bytes: Buffer;
    try {
      const root = await realpath(resolve(process.env.ARTIFACT_ROOT ?? ".data/artifacts"));
      const path = await realpath(resolve(rows[0].path as string));
      const child = relative(root, path);
      if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child))
        throw new Error("MODEL_ARTIFACT_UNAVAILABLE");
      const info = await stat(path);
      if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error("MODEL_ARTIFACT_UNAVAILABLE");
      bytes = await readFile(path);
    } catch { throw new Error("MODEL_ARTIFACT_UNAVAILABLE"); }
    if (createHash("sha256").update(bytes).digest("hex") !== rows[0].sha256)
      throw new Error("MODEL_ARTIFACT_CHECKSUM_MISMATCH");
    let artifact;
    try { artifact = parseDeployableArtifact(JSON.parse(bytes.toString("utf8"))); }
    catch { throw new Error("MODEL_ARTIFACT_INVALID"); }
    if (artifact.deployment.status !== "approved" || artifact.deployment.modelVersionId !== model.id ||
        artifact.deployment.version !== model.version || artifact.codeVersion !== model.codeVersion ||
        artifact.cutoff !== model.trainingCutoff) throw new Error("MODEL_ARTIFACT_REGISTRY_MISMATCH");
    // Feature/provenance validation belongs to P2; no error becomes a baseline prediction.
    try { return await predictApprovedModel(request, snapshot, artifact); }
    catch { throw new Error("MODEL_INPUTS_INVALID"); }
  };
}
