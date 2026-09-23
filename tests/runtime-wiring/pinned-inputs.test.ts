import test from "node:test";
import assert from "node:assert/strict";
import type postgres from "postgres";
import {fixture, request} from "../forecast/fixtures";
import {pinnedSnapshot} from "../../src/server/agent/pinned-inputs";
import {PostgresAgentPorts} from "../../src/server/agent/adapters";

test("trigger snapshots pin revisions without reading newer canonical inputs and fail closed when missing", async () => {
  const snapshot = (await fixture().service.run(request())).snapshot;
  const req = {...request(), dataPolicy: "history_only" as const, configVersion: snapshot.configVersion,
    weatherRunId: snapshot.weatherRunIds[0], eventKey: `input-trigger:v1:backtest:turbine-1:${request().issuedAt}:24:baseline-v1:${snapshot.configVersion}:${snapshot.sha256}`};
  const sql = (async () => {throw new Error("must not reselect");}) as unknown as ReturnType<typeof postgres>;
  const ports = new PostgresAgentPorts(sql, "config", undefined, undefined, undefined, async () => structuredClone(snapshot));
  const context = {jobId: "j", leaseToken: "l", signal: new AbortController().signal};
  assert.equal((await ports.listObservations(req, context))[0].revision, 1);
  assert.equal((await ports.fetchWeatherRun(req, context)).id, snapshot.weatherRunIds[0]);
  await assert.rejects(pinnedSnapshot(req), /TRIGGER_SNAPSHOT_UNAVAILABLE/);
  await assert.rejects(pinnedSnapshot(req, async () => null), /TRIGGER_SNAPSHOT_UNAVAILABLE/);
  await assert.rejects(pinnedSnapshot({...req, mode: "live"}, async () => snapshot), /TRIGGER_SNAPSHOT_MISMATCH/);
  await assert.rejects(pinnedSnapshot({...req, weatherRunId: "other"}, async () => snapshot), /TRIGGER_SNAPSHOT_MISMATCH/);
  const mutated = structuredClone(snapshot);
  mutated.observations[0].availableAt = "2026-02-02T00:00:00.000Z";
  await assert.rejects(pinnedSnapshot(req, async () => mutated), /TRIGGER_SNAPSHOT_MISMATCH|OBSERVATION_NOT_AVAILABLE/);
});
