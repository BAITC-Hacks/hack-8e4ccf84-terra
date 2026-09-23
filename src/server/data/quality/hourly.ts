export interface QualityPoint {
  eventTime: Date;
  value: number | null;
}

export interface HourlyAggregate {
  hour: Date;
  value: number | null;
  coverage: number;
  observed: number;
  expected: number;
  complete: boolean;
}

export function aggregateHourly(
  points: QualityPoint[],
  options: {
    sourceIntervalMinutes: number;
    timestampMeaning: "interval_start" | "interval_end";
    coverageThreshold: number;
    method: "mean" | "sum";
    window?: {from: Date; to: Date};
  },
): HourlyAggregate[] {
  if (60 % options.sourceIntervalMinutes !== 0)
    throw new Error("Source interval must divide one hour exactly.");
  if (options.coverageThreshold < 0 || options.coverageThreshold > 1)
    throw new Error("Coverage threshold must be between 0 and 1.");
  const expected = 60 / options.sourceIntervalMinutes;
  const buckets = new Map<number, Map<number, number>>();
  if (options.window) {
    const from = Date.UTC(
      options.window.from.getUTCFullYear(),
      options.window.from.getUTCMonth(),
      options.window.from.getUTCDate(),
      options.window.from.getUTCHours(),
    );
    const to = options.window.to.getTime();
    for (let hour = from; hour < to; hour += 3_600_000) buckets.set(hour, new Map());
  }
  for (const point of points) {
    if (point.value === null || !Number.isFinite(point.value)) continue;
    const bucketTime = options.timestampMeaning === "interval_end"
      ? new Date(point.eventTime.getTime() - options.sourceIntervalMinutes * 60_000)
      : point.eventTime;
    const hour = Date.UTC(
      bucketTime.getUTCFullYear(),
      bucketTime.getUTCMonth(),
      bucketTime.getUTCDate(),
      bucketTime.getUTCHours(),
    );
    const slot = Math.floor(bucketTime.getUTCMinutes() / options.sourceIntervalMinutes);
    const values = buckets.get(hour) ?? new Map<number, number>();
    values.set(slot, point.value);
    buckets.set(hour, values);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([hour, slots]) => {
      const values = [...slots.values()];
      const coverage = values.length / expected;
      const complete = coverage >= options.coverageThreshold;
      const total = values.reduce((sum, value) => sum + value, 0);
      return {
        hour: new Date(hour),
        value: complete ? (options.method === "mean" ? total / values.length : total) : null,
        coverage,
        observed: values.length,
        expected,
        complete,
      };
    });
}
