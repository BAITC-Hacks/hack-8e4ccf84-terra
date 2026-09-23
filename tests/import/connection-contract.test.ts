import assert from "node:assert/strict";
import {it} from "node:test";
import {createConnectionSchema} from "../../src/server/connectors/csv/repository";

it("does not enable a CSV connection before explicit mapping/time/unit confirmation", () => {
  const result = createConnectionSchema.safeParse({
    type: "csv",
    name: "Turbine upload",
    enabled: true,
    config: {
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
        timeZone: "UTC",
        timestampMeaning: "interval_start",
        sourceIntervalMinutes: 10,
        availabilityLagMinutes: 10,
        availabilityAssumption: "available after interval",
      },
      units: {
        windSpeed: "m/s",
        normalizedPower: "normalized",
        ambientTemperature: "degC",
      },
      hourlyCoverageThreshold: 1,
      confirmed: false,
    },
  });
  assert.equal(result.success, false);
});
