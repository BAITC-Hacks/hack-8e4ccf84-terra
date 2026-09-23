import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {aggregateHourly} from "../../src/server/data/quality/hourly";

describe("hourly aggregation", () => {
  it("computes coverage and does not replace missing values with zero", () => {
    const points = [0, 10, 20, 30, 40].map((minute) => ({
      eventTime: new Date(`2025-01-01T00:${String(minute).padStart(2, "0")}:00Z`),
      value: 0.5,
    }));
    const [hour] = aggregateHourly(points, {
      sourceIntervalMinutes: 10,
      timestampMeaning: "interval_start",
      coverageThreshold: 1,
      method: "mean",
    });
    assert.equal(hour.coverage, 5 / 6);
    assert.equal(hour.complete, false);
    assert.equal(hour.value, null);
  });

  it("averages a fully covered mean-power hour", () => {
    const points = [0, 10, 20, 30, 40, 50].map((minute, index) => ({
      eventTime: new Date(`2025-01-01T00:${String(minute).padStart(2, "0")}:00Z`),
      value: index,
    }));
    const [hour] = aggregateHourly(points, {
      sourceIntervalMinutes: 10,
      timestampMeaning: "interval_start",
      coverageThreshold: 1,
      method: "mean",
    });
    assert.equal(hour.coverage, 1);
    assert.equal(hour.value, 2.5);
  });

  it("reports a completely missing hour with zero coverage and a null value", () => {
    const [hour] = aggregateHourly([], {
      sourceIntervalMinutes: 10,
      timestampMeaning: "interval_start",
      coverageThreshold: 1,
      method: "mean",
      window: {
        from: new Date("2025-01-01T00:00:00Z"),
        to: new Date("2025-01-01T01:00:00Z"),
      },
    });
    assert.equal(hour.coverage, 0);
    assert.equal(hour.value, null);
  });

  it("assigns interval-end timestamps to the hour containing the interval", () => {
    const points = [10, 20, 30, 40, 50, 60].map((minute) => ({
      eventTime: new Date(`2025-01-01T${minute === 60 ? "01:00" : `00:${minute}`}:00Z`),
      value: 1,
    }));
    const [hour] = aggregateHourly(points, {
      sourceIntervalMinutes: 10,
      timestampMeaning: "interval_end",
      coverageThreshold: 1,
      method: "mean",
    });
    assert.equal(hour.hour.toISOString(), "2025-01-01T00:00:00.000Z");
    assert.equal(hour.coverage, 1);
  });
});
