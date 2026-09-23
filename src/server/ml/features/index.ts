export interface TrainingExample {
  timestamp: string;
  windSpeed: number;
  temperature: number;
  assetId: string;
  leadHours: number;
  target: number;
  /** Optional as-of bounds supplied by the archived-forecast training path. */
  issuedAt?: string;
  targetAvailableAt?: string;
}

export interface FeatureDefinition {
  names: string[];
  assetIds: string[];
}

export interface StandardScaler {
  means: number[];
  scales: number[];
}

const BASE_FEATURE_NAMES = [
  "wind_speed",
  "wind_speed_squared",
  "wind_speed_cubed",
  "temperature",
  "wind_temperature",
  "hour_sin",
  "hour_cos",
  "year_day_sin",
  "year_day_cos",
  "lead_hours",
] as const;

export function assertFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite; received ${String(value)}`);
  }
  return value;
}

export function validateExample(example: TrainingExample, index?: number): void {
  const prefix = index === undefined ? "example" : `example[${index}]`;
  const timestamp = new Date(example.timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${prefix}.timestamp is not a valid instant`);
  }
  if (!example.assetId.trim()) throw new Error(`${prefix}.assetId is required`);
  assertFinite(example.windSpeed, `${prefix}.windSpeed`);
  assertFinite(example.temperature, `${prefix}.temperature`);
  assertFinite(example.leadHours, `${prefix}.leadHours`);
  assertFinite(example.target, `${prefix}.target`);
  if (example.windSpeed < 0) throw new Error(`${prefix}.windSpeed must be non-negative`);
  if (example.leadHours < 0) throw new Error(`${prefix}.leadHours must be non-negative`);
}

export function createFeatureDefinition(examples: TrainingExample[]): FeatureDefinition {
  examples.forEach(validateExample);
  const assetIds = [...new Set(examples.map((example) => example.assetId))].sort();
  if (assetIds.length === 0) throw new Error("At least one training example is required");
  return {
    names: [...BASE_FEATURE_NAMES, ...assetIds.map((id) => `asset:${id}`)],
    assetIds,
  };
}

export function buildFeatures(
  example: TrainingExample,
  definition: FeatureDefinition,
): number[] {
  validateExample(example);
  const date = new Date(example.timestamp);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const yearDay = (date.getTime() - yearStart) / 86_400_000;
  const hourAngle = (2 * Math.PI * hour) / 24;
  const yearAngle = (2 * Math.PI * yearDay) / 365.2425;
  const wind = example.windSpeed;
  const values = [
    wind,
    wind * wind,
    wind * wind * wind,
    example.temperature,
    wind * example.temperature,
    Math.sin(hourAngle),
    Math.cos(hourAngle),
    Math.sin(yearAngle),
    Math.cos(yearAngle),
    example.leadHours,
    ...definition.assetIds.map((id) => (id === example.assetId ? 1 : 0)),
  ];
  values.forEach((value, index) => assertFinite(value, `feature ${definition.names[index]}`));
  return values;
}

export function fitScaler(rows: number[][]): StandardScaler {
  if (rows.length === 0) throw new Error("Cannot fit a scaler without training rows");
  const width = rows[0].length;
  if (width === 0 || rows.some((row) => row.length !== width)) {
    throw new Error("Feature rows must have a consistent non-zero width");
  }
  const means = Array<number>(width).fill(0);
  for (const row of rows) {
    row.forEach((value, column) => {
      means[column] += assertFinite(value, `training feature ${column}`);
    });
  }
  means.forEach((_, column) => (means[column] /= rows.length));
  const variances = Array<number>(width).fill(0);
  for (const row of rows) {
    row.forEach((value, column) => {
      variances[column] += (value - means[column]) ** 2;
    });
  }
  const scales = variances.map((sum) => {
    const scale = Math.sqrt(sum / rows.length);
    return scale > 1e-12 ? scale : 1;
  });
  return {means, scales};
}

export function scaleFeatures(values: number[], scaler: StandardScaler): number[] {
  if (values.length !== scaler.means.length || values.length !== scaler.scales.length) {
    throw new Error("Feature and scaler dimensions do not match");
  }
  return values.map((value, index) =>
    assertFinite((value - scaler.means[index]) / scaler.scales[index], `scaled feature ${index}`),
  );
}
