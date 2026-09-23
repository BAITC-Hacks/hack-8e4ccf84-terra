import assert from "node:assert/strict";
import test from "node:test";
import {prepareActuals} from "../../src/server/evaluation/actuals";
import {evaluatePublishedPoints, uniquePublishedPoints, snapshotBaseline} from "../../src/server/evaluation/published";
import {februaryWindow, semanticManifestSchema} from "../../src/server/evaluation/semantics";
import sourceManifest from "../../src/server/evaluation/semantic-manifest.json";
import {assetId, manifest, point} from "./fixtures";
import type {Observation} from "../../src/server/contracts";

const evaluate = (points: ReturnType<typeof point>[]) => evaluatePublishedPoints({id: "test", backtestJobId: "test",
  snapshotHash: "fixture", points: uniquePublishedPoints(points)});
test("reference metrics, common baseline pairs, coverage, asset and lead groups", () => {
  const report = evaluate([point({prediction: 1, actual: 3, baselinePrediction: 0}),
    point({targetTime: "2026-02-01T01:00:00.000Z", leadHour: 2, prediction: 7, actual: 3, baselinePrediction: null}),
    point({targetTime: "2026-02-02T00:00:00.000Z", leadHour: 25, prediction: 0, actual: 3, baselinePrediction: 6}),
    point({targetTime: "2026-02-01T02:00:00.000Z", leadHour: 3, actual: null})]);
  assert.deepEqual(report.metrics[0].model, {mae: 3, rmse: Math.sqrt(29 / 3), n: 3});
  assert.deepEqual(report.metrics[0].comparison, {model: {mae: 2.5, rmse: Math.sqrt(6.5), n: 2}, baseline: {mae: 3, rmse: 3, n: 2}});
  assert.equal(report.coverage, 0.75);
  assert.equal(report.eligiblePairCount, 4);
  assert.ok(report.metrics.some((s) => s.dimension === "asset_lead" && s.leadBucket === "lead_25_48" && s.model?.n === 1));
});
test("N=0 has null metrics and an explicit exclusion; March tails excluded", () => {
  const report = evaluate([point({actual: null}), point({issuedAt: "2026-02-28T23:00:00.000Z", targetTime: "2026-03-01T00:00:00.000Z"})]);
  assert.equal(report.evaluatedPairCount, 0);
  assert.equal(report.metrics[0].model, null);
  assert.equal(report.metrics[0].comparison, null);
  assert.ok(report.metrics.some((s) => s.dimension === "asset" && s.assetId === assetId && s.model === null));
  assert.deepEqual(report.exclusions.map((e) => e.reason), ["missing_actual", "outside_evaluation_period"]);
});
test("identical duplicate publication rows collapse, distinct issue/lead samples remain", () => {
  assert.equal(evaluate([point(), point()]).evaluatedPairCount, 1);
  assert.equal(evaluate([point(), point({forecastRunId: "earlier", issuedAt: "2026-01-31T22:00:00.000Z", leadHour: 2})]).evaluatedPairCount, 2);
  assert.throws(() => uniquePublishedPoints([point(), point({prediction: 0.9})]), /CONFLICTING/);
  assert.throws(() => uniquePublishedPoints([point({leadHour: 2})]), /INVALID/);
  assert.throws(() => uniquePublishedPoints([point({unit: "MW"})]), /INVALID/);
  assert.throws(() => evaluate([point({prediction: 1e308})]), /NON_FINITE/);
});
test("February uses explicit calendar boundaries including non-UTC March tail", () => {
  assert.deepEqual(februaryWindow("Asia/Almaty"), {start: "2026-01-31T19:00:00.000Z", endExclusive: "2026-02-28T19:00:00.000Z"});
  assert.deepEqual(februaryWindow("America/New_York"), {start: "2026-02-01T05:00:00.000Z", endExclusive: "2026-03-01T05:00:00.000Z"});
  assert.throws(() => februaryWindow("computer-local"), /INVALID/);
});
test("actual import is deterministic, rejects ambiguous duplicates, unknown semantics and non-February targets", () => {
  const row = {assetId, targetTime: point().targetTime, unit: "normalized", value: 0.4};
  const bundle = {source: "synthetic fixture", sourceSha256: "a".repeat(64), manifest: manifest(), rows: [row]};
  assert.equal(prepareActuals(bundle).fingerprint, prepareActuals({...bundle, rows: [row, row]}).fingerprint);
  assert.throws(() => prepareActuals({...bundle, rows: [row, {...row, value: 0.5}]}), /CONFLICTING/);
  assert.throws(() => prepareActuals({...bundle, rows: [{...row, targetTime: "2026-03-01T00:00:00.000Z"}]}), /OUTSIDE/);
  assert.throws(() => prepareActuals({...bundle, rows: [{...row, targetTime: "2026-02-01 00:00:00"}]}));
  assert.throws(() => prepareActuals({...bundle, manifest: sourceManifest}), /UNCONFIRMED/);
  assert.equal(semanticManifestSchema.parse(sourceManifest).timezone.status, "UNKNOWN");
});
test("baseline cannot use February targets or late revisions even after issue time advances", () => {
  const observation: Observation = {id: "a", assetId, metric: "normalized_power", value: 0.3, unit: "normalized",
    eventTime: "2026-01-31T23:00:00.000Z", availableAt: "2026-01-31T23:01:00.000Z", revision: 1,
    ingestedAt: "2026-03-01T00:00:00.000Z", qualityFlag: "accepted", sourceTimeZone: "UTC",
    availabilityAssumption: null, rawArtifactId: null};
  const cutoff = "2026-02-01T00:00:00.000Z", issuedAt = "2026-02-02T00:00:00.000Z";
  const future = {...observation, id: "future", eventTime: cutoff, value: 900};
  const late = {...observation, id: "late", revision: 2, availableAt: "2026-03-01T00:00:00.000Z", value: 800};
  assert.equal(snapshotBaseline([future, late, observation], assetId, issuedAt, cutoff), 0.3);
  assert.equal(snapshotBaseline([future, late], assetId, issuedAt, cutoff), null);
});
