import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduledIssues, triggerConfigSchema } from "../../src/server/triggers/config";

const base = { assetIds: ["11111111-1111-4111-8111-111111111111"],
  modelVersionId: "22222222-2222-4222-8222-222222222222", configVersion: "test-v1",
  mode: "live", timezone: "Asia/Qyzylorda", issueHours: [5],
  startAt: "2026-01-31T00:00:00.000Z", horizons: [24, 48] };

test("explicit timezone, horizon, mode and calendar validation", () => {
  assert.deepEqual([...scheduledIssues(triggerConfigSchema.parse(base), "2026-02-01T03:00:00.000Z")],
    ["2026-01-31T00:00:00.000Z", "2026-02-01T00:00:00.000Z"]);
  for (const invalid of [{ timezone: undefined }, { timezone: "machine-local" }, { timezone: "+05:00" }, { mode: "auto" },
    { horizons: [12] }, { startAt: "2026-01-31T00:30:00.000Z" }, { assetIds: [...base.assetIds, ...base.assetIds] },
    { endAt: "2026-01-30T00:00:00.000Z" }, { pollMs: 0 }]) {
    assert.equal(triggerConfigSchema.safeParse({ ...base, ...invalid }).success, false);
  }
});

test("DST duplicated hours are distinct UTC releases; missing local hours are skipped", () => {
  const config = triggerConfigSchema.parse({ ...base, timezone: "America/New_York", issueHours: [1],
    startAt: "2026-11-01T00:00:00.000Z", endAt: "2026-11-01T08:00:00.000Z" });
  assert.deepEqual([...scheduledIssues(config, config.endAt!)],
    ["2026-11-01T05:00:00.000Z", "2026-11-01T06:00:00.000Z"]);
  assert.deepEqual([...scheduledIssues({ ...config, issueHours: [2], startAt: "2026-03-08T05:00:00.000Z",
    endAt: "2026-03-08T08:00:00.000Z" }, "2026-03-08T08:00:00.000Z")], []);
  assert.throws(() => [...scheduledIssues({ ...config, timezone: "Asia/Kolkata" }, config.endAt!)], /NON_WHOLE/);
});
