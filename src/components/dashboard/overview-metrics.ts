import type { Forecast, Mode, Point } from "./contracts";

export const FORECAST_INTERVAL_HOURS = 1;
export const LARGE_CHANGE_THRESHOLD = 0.15;

type AvailablePoint = Point & { prediction: number };

function availablePoints(forecast?: Forecast): AvailablePoint[] {
  return forecast?.points.filter((point): point is AvailablePoint => point.prediction != null) ?? [];
}

export function deriveOverviewMetrics(forecasts: Forecast[], mode: Mode) {
  const versions = forecasts
    .filter((forecast) => forecast.mode === mode)
    .sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  const latest = versions[0];
  const previous = versions.find((forecast) => forecast.asset_id === latest?.asset_id && forecast.id !== latest.id);
  const points = availablePoints(latest);
  const previousByTime = new Map(
    availablePoints(previous).map((point) => [point.target_time, point.prediction]),
  );
  const comparisons = points.flatMap((point) => {
    const before = previousByTime.get(point.target_time);
    return before == null ? [] : [{ point, before, difference: point.prediction - before }];
  });
  const peak = points.reduce<AvailablePoint | undefined>(
    (best, point) => !best || point.prediction > best.prediction ? point : best,
    undefined,
  );
  const low = points.reduce<AvailablePoint | undefined>(
    (best, point) => !best || point.prediction < best.prediction ? point : best,
    undefined,
  );
  const largestChange = comparisons.reduce<(typeof comparisons)[number] | undefined>(
    (best, item) => !best || Math.abs(item.difference) > Math.abs(best.difference) ? item : best,
    undefined,
  );
  const largeChanges = comparisons.filter(
    (item) => Math.abs(item.difference) >= LARGE_CHANGE_THRESHOLD,
  ).length;
  const normalizedIntegral = points.length
    ? points.reduce((sum, point) => sum + point.prediction * FORECAST_INTERVAL_HOURS, 0)
    : null;

  return {
    latest,
    previous,
    points,
    peak,
    low,
    largestChange,
    largeChanges,
    normalizedIntegral,
    intervalHours: FORECAST_INTERVAL_HOURS,
  };
}
