import { test } from "node:test";
import assert from "node:assert/strict";
import type postgres from "postgres";
import { postgresBatchAdapter } from "../../src/server/replay/batch/postgres";
import type { JobPayload } from "../../src/server/jobs/types";
const request: JobPayload = { assetIds: ["11111111-1111-4111-8111-111111111111"],
  issuedAt: "2026-01-31T00:00:00.000Z", horizonHours: 24, mode: "replay",
  modelVersionId: "33333333-3333-4333-8333-333333333333", configVersion: "agent-v1",
  dataPolicy: "history_only", eventKey: "" };
function adapter(model: object[]) {
  const query = Object.assign(async (parts: TemplateStringsArray) => {
    const sql = parts.join("?");
    if (sql.includes("FROM model_versions")) return model;
    if (sql.includes("FROM weather_runs")) {
      assert.match(sql,/w.available_at <=/); assert.match(sql,/w.published_at <=/); return [];
    }
    if (sql.includes("FROM observations")) { assert.match(sql,/available_at <=/); return []; }
    throw new Error("Unexpected preflight query");
  }, { array: (value: unknown) => value });
  return postgresBatchAdapter(query as unknown as ReturnType<typeof postgres>);
}
test("production preflight rejects unapproved, unknown and future training cutoffs", async () => {
  assert.deepEqual((await adapter([]).preflight(request)).missing,["MODEL_NOT_APPROVED"]);
  assert.deepEqual((await adapter([{name:"ridge",status:"approved",training_cutoff:null}]).preflight(request)).missing,
    ["MODEL_TRAINING_CUTOFF_UNKNOWN"]);
  assert.deepEqual((await adapter([{name:"ridge",status:"approved",training_cutoff:"2026-02-01"}]).preflight(request)).missing,
    ["MODEL_TRAINING_CUTOFF_LEAKAGE"]);
});
test("production preflight reports absent archive/observations without a current-weather fallback", async () => {
  const result = await adapter([{name:"ridge",status:"approved",training_cutoff:"2026-01-30"}]).preflight(request);
  assert.deepEqual(result.missing,["NO_ELIGIBLE_WEATHER_RUN","MISSING_OBSERVATIONS"]);
  assert.deepEqual(result.versions,{weatherRunIds:[],observationRevisions:[]});
});
