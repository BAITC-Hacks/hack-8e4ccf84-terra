import {assertFinite, type TrainingExample, validateExample} from "../features";

export interface PowerCurvePoint {
  windSpeed: number;
  power: number;
  count: number;
}

export interface PowerCurveArtifact {
  kind: "power_curve";
  binWidth: number;
  points: PowerCurvePoint[];
}

export interface MeanBaselineArtifact {
  kind: "mean_baseline";
  mean: number;
}

export function fitPowerCurve(examples: TrainingExample[], binWidth = 0.5): PowerCurveArtifact {
  assertFinite(binWidth, "binWidth");
  if (binWidth <= 0) throw new Error("binWidth must be positive");
  if (examples.length === 0) throw new Error("Cannot fit a power curve without examples");
  const bins = new Map<number, {sum: number; count: number}>();
  examples.forEach((example, index) => {
    validateExample(example, index);
    const center = Math.round(example.windSpeed / binWidth) * binWidth;
    const current = bins.get(center) ?? {sum: 0, count: 0};
    current.sum += example.target;
    current.count += 1;
    bins.set(center, current);
  });
  return {
    kind: "power_curve",
    binWidth,
    points: [...bins.entries()]
      .sort(([left], [right]) => left - right)
      .map(([windSpeed, bin]) => ({windSpeed, power: bin.sum / bin.count, count: bin.count})),
  };
}

export function predictPowerCurve(artifact: PowerCurveArtifact, windSpeed: number): number {
  assertFinite(windSpeed, "windSpeed");
  if (artifact.points.length === 0) throw new Error("Power curve artifact has no points");
  if (windSpeed <= artifact.points[0].windSpeed) return artifact.points[0].power;
  const last = artifact.points.at(-1)!;
  if (windSpeed >= last.windSpeed) return last.power;
  const upperIndex = artifact.points.findIndex((point) => point.windSpeed >= windSpeed);
  const lower = artifact.points[upperIndex - 1];
  const upper = artifact.points[upperIndex];
  const ratio = (windSpeed - lower.windSpeed) / (upper.windSpeed - lower.windSpeed);
  return assertFinite(lower.power + ratio * (upper.power - lower.power), "power curve prediction");
}

export function fitMeanBaseline(examples: TrainingExample[]): MeanBaselineArtifact {
  if (examples.length === 0) throw new Error("Cannot fit a baseline without examples");
  const mean = examples.reduce((sum, example, index) => {
    validateExample(example, index);
    return sum + example.target;
  }, 0) / examples.length;
  return {kind: "mean_baseline", mean: assertFinite(mean, "baseline mean")};
}
