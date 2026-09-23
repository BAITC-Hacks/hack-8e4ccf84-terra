import {createHash} from "node:crypto";
import type {
  ForecastRequest, ForecastRun, ForecastValue, ModelVersion,
  ObservationReader, WeatherRunReader,
} from "../contracts";
import {buildForecastSnapshot, targetHours, type ForecastInputSnapshot} from "../data/snapshot/build";
import {predictPersistence} from "../ml/baseline/persistence";

export interface StoredForecast extends Omit<ForecastRun, "idempotencyKey" | "incompleteReasons"> {
  idempotencyKey: string;
  previousVersionId: string | null;
  snapshot: ForecastInputSnapshot;
  incompleteReasons: string[];
}

export interface ForecastStore {
  publish(input: Omit<StoredForecast, "id" | "version" | "previousVersionId">,
    guard?: { jobId: string; leaseToken: string; now: string }): Promise<StoredForecast>;
  list(filter?: {assetId?: string; issuedAt?: string; mode?: ForecastRequest["mode"];
    horizonHours?: 24 | 48}): Promise<StoredForecast[]>;
}

export function forecastIdempotencyKey(request: ForecastRequest, snapshot: ForecastInputSnapshot): string {
  const tuple = [[...request.assetIds].sort(), request.issuedAt, request.horizonHours,
    snapshot.sha256, request.modelVersionId, request.mode, request.dataPolicy, snapshot.configVersion];
  return createHash("sha256").update(JSON.stringify(tuple)).digest("hex");
}

export function validateForecastValues(request: ForecastRequest, values: ForecastValue[]): string[] {
  const expected = new Set(targetHours(request.issuedAt, request.horizonHours));
  const reasons: string[] = [];
  for (const assetId of request.assetIds) {
    const rows = values.filter((row) => row.assetId === assetId);
    if (rows.length !== request.horizonHours || new Set(rows.map((row) => row.targetTime)).size !== expected.size ||
      rows.some((row) => !expected.has(row.targetTime) || !Number.isFinite(row.value) ||
        row.unit !== "normalized")) {
      reasons.push(`points:${assetId}`);
    }
  }
  if (values.some((row) => !request.assetIds.includes(row.assetId))) reasons.push("unexpected_asset");
  return reasons;
}

export class ForecastService {
  constructor(
    private readonly observations: ObservationReader,
    private readonly weather: WeatherRunReader,
    private readonly store: ForecastStore,
    private readonly configVersion: string,
    private readonly model: ModelVersion,
  ) {}

  async run(request: ForecastRequest): Promise<StoredForecast> {
    if (request.dataPolicy !== "history_only") throw new Error("EVALUATION_DATA_FORBIDDEN");
    if (request.modelVersionId !== this.model.id || this.model.status !== "approved" ||
      this.model.name !== "persistence") throw new Error("MODEL_NOT_APPROVED");
    const snapshot = await buildForecastSnapshot(request, this.observations, this.weather,
      this.configVersion);
    const values = snapshot.missing.length ? [] : predictPersistence(request, snapshot);
    const incompleteReasons = [...snapshot.missing, ...validateForecastValues(request, values)];
    const status = incompleteReasons.length ? "incomplete" : "published";
    const createdAt = new Date().toISOString();
    return this.store.publish({
      request, snapshot, inputSnapshotId: snapshot.id, status,
      idempotencyKey: forecastIdempotencyKey(request, snapshot),
      createdAt, publishedAt: status === "published" ? createdAt : null,
      values: status === "published" ? values : [], incompleteReasons,
    });
  }

  list(filter?: Parameters<ForecastStore["list"]>[0]) { return this.store.list(filter); }
}
