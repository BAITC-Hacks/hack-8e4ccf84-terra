import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {MemoryImportRepository} from "../../src/server/data/import/memory-repository";
import {CsvImportService, issuesCsv} from "../../src/server/data/import/service";
import type {ArtifactStore} from "../../src/server/data/import/types";
import {observationsForPurpose} from "../../src/server/data/quality/data-use";

const artifacts: ArtifactStore = {
  async saveRaw(sha256) {
    return `/artifacts/${sha256}.csv`;
  },
};

function config(confirmed = true) {
  return {
    assetId: "turbine-1",
    dialect: {encoding: "utf-8", delimiter: ",", decimalSeparator: "."},
    mapping: {
      timestamp: "time",
      windSpeed: "wind",
      normalizedPower: "power",
      ambientTemperature: "temperature",
    },
    time: {
      format: "yyyy-MM-dd HH:mm:ss",
      timeZone: "Asia/Almaty",
      timestampMeaning: "interval_start",
      sourceIntervalMinutes: 10,
      availabilityLagMinutes: 10,
      availabilityAssumption: "available after the source interval",
    },
    units: {
      windSpeed: "m/s",
      normalizedPower: "normalized",
      ambientTemperature: "degC",
    },
    hourlyCoverageThreshold: 1,
    confirmed,
  };
}

describe("CSV import", () => {
  it("requires confirmation before persistence and returns a preview", async () => {
    const repository = new MemoryImportRepository();
    const service = new CsvImportService(repository, artifacts, 2);
    const bytes = new TextEncoder().encode("time,wind,power,temperature\n2025-01-01 00:00:00,5,0.4,10\n");
    const result = await service.import({bytes, fileName: "sample.csv", config: config(false)});
    assert.equal("requiresConfirmation" in result, true);
    assert.equal(repository.imports.size, 0);
    if ("preview" in result) assert.equal(result.preview.totalRows, 1);
  });

  it("reports accepted, rejected, duplicate and revised rows", async () => {
    const repository = new MemoryImportRepository();
    const service = new CsvImportService(repository, artifacts, 2);
    const csv = [
      "time,wind,power,temperature",
      "2025-01-01 00:00:00,5,0.4,10",
      "2025-01-01 00:00:00,5,0.4,10",
      "2025-01-01 00:00:00,5,0.5,10",
      "2025-01-01 00:10:00,,0.5,10",
    ].join("\n");
    const result = await service.import({
      bytes: new TextEncoder().encode(csv),
      fileName: "quality.csv",
      config: config(),
    });
    assert.ok(result && !("requiresConfirmation" in result));
    assert.equal(result.sha256.length, 64);
    const firstObservation = [...repository.observations.values()][0][0];
    assert.equal(firstObservation.eventTime.toISOString(), "2024-12-31T19:00:00.000Z");
    assert.deepEqual(result.report, {
      read: 4,
      accepted: 2,
      rejected: 1,
      duplicates: 1,
      revisions: 1,
      evaluationOnly: 0,
      reasons: {missing_value: 1},
    });
    assert.match(issuesCsv(await repository.issues(result.id)), /missing_value/);
  });

  it("is idempotent for the same raw file and confirmed mapping", async () => {
    const repository = new MemoryImportRepository();
    const service = new CsvImportService(repository, artifacts);
    const bytes = new TextEncoder().encode("time,wind,power,temperature\n2025-01-01 00:00:00,5,0.4,10\n");
    const first = await service.import({bytes, fileName: "same.csv", config: config()});
    const second = await service.import({bytes, fileName: "same.csv", config: config()});
    assert.ok(first && second && !("requiresConfirmation" in first) && !("requiresConfirmation" in second));
    assert.equal(first.id, second.id);
    assert.equal(repository.imports.size, 1);
    assert.equal(repository.observations.size, 3);
  });

  it("keeps February 2026 targets evaluation-only", async () => {
    const repository = new MemoryImportRepository();
    const service = new CsvImportService(repository, artifacts);
    const bytes = new TextEncoder().encode("time,wind,power,temperature\n2026-02-01 00:00:00,5,0.4,10\n");
    const result = await service.import({bytes, fileName: "february.csv", config: config()});
    assert.ok(result && !("requiresConfirmation" in result));
    assert.equal(result.report.evaluationOnly, 1);
    const values = [...repository.observations.values()].flat();
    assert.equal(observationsForPurpose(values, "training").length, 2);
    assert.equal(observationsForPurpose(values, "evaluation").length, 3);
  });
});
