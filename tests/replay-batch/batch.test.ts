import { test } from "node:test";
import assert from "node:assert/strict";
import { createManifest, runBatch, exportBatch, issueTimes, type BatchAdapter, type BatchConfig } from "../../src/server/replay/batch/index";
import { MemoryJobStore } from "../../src/server/jobs/memory-store";
import type { StoredForecast } from "../../src/server/forecast/service";
import type { JobPayload } from "../../src/server/jobs/types";

const config: BatchConfig = { assetIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
  modelVersionId: "33333333-3333-4333-8333-333333333333", timezone: "UTC", issueHour: 0,
  from: "2026-01-31", to: "2026-02-28", mode: "replay", configVersion: "agent-v1" };
function fixture(options: { gap?: boolean; fail?: boolean; paused?: boolean; mismatch?: boolean } = {}) {
  const store = new MemoryJobStore(), forecasts = new Map<string,StoredForecast>();
  let enqueues = 0, preflights = 0;
  const adapter: BatchAdapter = {
    synthetic: true,
    async preflight() { preflights++; return { versions: { weatherRunIds: ["weather"],
      observationRevisions: [{ observationId: "obs", revision: 1 }] }, missing: options.gap && preflights === 2 ? ["weather_gap"] : [] }; },
    async forecast(id) { return forecasts.get(id) ?? null; },
    jobs: {
      async enqueue(key, request, now, attempts) { enqueues++; return store.enqueue(key,request,now,attempts); },
      async get(id) {
        const job = await store.get(id);
        if (!job || options.paused || job.status === "cancelled") return job;
        if (options.fail && job.payload.horizonHours === 48) return { ...job, status: "failed", errorCode: "MODEL_FAILURE" };
        const f = forecast(job.payload, `forecast-${id}`);
        if (options.mismatch) f.snapshot.observationRevisions[0].revision = 2;
        forecasts.set(f.id,f);
        return { ...job, status: "completed", resultId: f.id };
      },
      cancel: (id,now) => store.cancel(id,now),
    },
  };
  return { adapter, options, get enqueues() { return enqueues; }, get preflights() { return preflights; } };
}
function forecast(r: JobPayload, id: string): StoredForecast {
  return { id, request: r, status: "published", version: 1, previousVersionId: null,
    inputSnapshotId: "snapshot", createdAt: r.issuedAt, publishedAt: r.issuedAt, idempotencyKey: r.eventKey,
    incompleteReasons: [], values: Array.from({length: r.horizonHours}, (_,i) => ({ assetId: r.assetIds[0],
      targetTime: new Date(Date.parse(r.issuedAt)+(i+1)*3600000).toISOString(), value: 0.5, unit: "normalized", qualityFlag: "synthetic" })),
    snapshot: { id: "snapshot", issuedAt: r.issuedAt, assetIds: r.assetIds, weatherRunIds: ["weather"],
      observationRevisions: [{ observationId: "obs", revision: 1 }], sha256: "hash", configVersion: r.configVersion,
      createdAt: r.issuedAt, payload: {}, observations: [], weatherRuns: [], weatherValues: [], missing: [] } };
}
const noSave = async () => {};
const short = { ...config, to: "2026-01-31" };

test("full 29-day sequence, preflight before enqueue, canonical export and March tail", async () => {
  const f = fixture(), m = createManifest(config,true);
  const enqueue = f.adapter.jobs.enqueue;
  f.adapter.jobs.enqueue = async (...args) => { assert.equal(f.preflights,116); return enqueue(...args); };
  await runBatch(m,f.adapter,noSave,{maxPolls:1});
  assert.equal(m.releases.length,116);
  assert.ok(m.releases.every(r => r.status === "completed"));
  assert.deepEqual(m.releases.slice(0,4).map(r => r.request.horizonHours),[24,48,24,48]);
  const exported = await exportBatch(m,f.adapter);
  assert.equal(exported.rows.length,29*2*72);
  assert.ok(exported.rows.some(r => r.targetTime.startsWith("2026-03") && !r.inFebruaryEvaluation));
  assert.ok(exported.rows.filter(r => r.targetTime.startsWith("2026-02")).every(r => r.inFebruaryEvaluation));
  assert.ok(exported.rows.every(r => r.synthetic && r.unit === "normalized" && r.lead >= 1 && r.lead <= 48));
  assert.equal(exported.officialResult,false);
  await runBatch(m,f.adapter,noSave);
  assert.equal(f.enqueues,116);
});
test("gaps and partial terminal failures remain explicit on repeated run", async () => {
  const f = fixture({gap:true,fail:true}), m = createManifest(short,true);
  await runBatch(m,f.adapter,noSave,{maxPolls:1});
  assert.deepEqual(m.releases.map(r=>r.status),["completed","missing","completed","failed"]);
  await runBatch(m,f.adapter,noSave);
  assert.equal(f.enqueues,3);
});
test("crash after enqueue before manifest write resumes by deterministic store key", async () => {
  const f = fixture(), m = createManifest(short,true);
  let disk = structuredClone(m);
  await assert.rejects(runBatch(m,f.adapter,async state => {
    if (state.releases.some(r=>r.status === "running")) throw new Error("disk crash");
    disk = structuredClone(state);
  }),/disk crash/);
  assert.equal(disk.releases[0].status,"ready");
  const key = m.releases[0].request.eventKey;
  await runBatch(disk,f.adapter,noSave,{maxPolls:1});
  assert.equal(disk.releases[0].request.eventKey,key);
  assert.equal(disk.releases[0].jobId,m.releases[0].jobId);
  assert.ok(disk.releases.every(r=>r.status === "completed"));
});
test("bounded timeout resumes the same jobs without enqueue", async () => {
  const f = fixture({paused:true}), m = createManifest(short,true);
  let sleeps = 0;
  await runBatch(m,f.adapter,noSave,{maxPolls:2,pollMs:0,sleep:async()=>{sleeps++;}});
  assert.equal(sleeps,1); assert.equal(m.releases[0].status,"timeout");
  const firstId = m.releases[0].jobId;
  f.options.paused = false;
  await runBatch(m,f.adapter,noSave,{maxPolls:1});
  assert.equal(m.releases[0].jobId,firstId); assert.equal(f.enqueues,4);
});
test("cancel uses existing store and preserves unstarted releases", async () => {
  const f = fixture({paused:true}), m = createManifest(short,true), abort = new AbortController();
  await runBatch(m,f.adapter,noSave,{maxPolls:3,pollMs:0,signal:abort.signal,sleep:async()=>abort.abort()});
  assert.equal(m.releases[0].status,"cancelled");
  assert.equal(f.enqueues,1); assert.equal(m.releases[1].status,"ready");
});
test("input drift fails instead of exporting the wrong canonical result", async () => {
  const f = fixture({mismatch:true}), m = createManifest(short,true);
  await runBatch(m,f.adapter,noSave,{maxPolls:1});
  assert.ok(m.releases.every(r=>r.status === "failed"));
  assert.equal((await exportBatch(m,f.adapter)).rows.length,0);
});
test("calendar timezone, invalid range, DST ambiguity, live mode and resume mismatch", async () => {
  assert.equal(issueTimes({...short,timezone:"Asia/Almaty"})[0],"2026-01-30T19:00:00.000Z");
  assert.throws(()=>issueTimes({...short,timezone:"not-a-zone"}));
  assert.throws(()=>issueTimes({...short,to:"2026-01-30"}),/INVALID_RANGE/);
  assert.throws(()=>issueTimes({...short,from:"2026-11-01",to:"2026-11-01",timezone:"America/New_York",issueHour:1}),/AMBIGUOUS/);
  assert.throws(()=>issueTimes({...short,timezone:"Asia/Kolkata"}),/UNSUPPORTED/);
  assert.throws(()=>createManifest({...short,mode:"live" as "replay"}));
  const m = createManifest(short,true); m.config.issueHour = 1;
  await assert.rejects(runBatch(m,fixture().adapter,noSave),/MANIFEST_MISMATCH/);
  await assert.rejects(runBatch(createManifest(short),fixture().adapter,noSave),/MANIFEST_MISMATCH/);
});
