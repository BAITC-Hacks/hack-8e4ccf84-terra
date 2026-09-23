import type {ForecastRequest} from "../contracts";
import {validateForecastValues, type ForecastStore, type StoredForecast} from "./service";

function seriesKey(request: ForecastRequest): string {
  return JSON.stringify([request.assetIds.toSorted(), request.issuedAt,
    request.horizonHours, request.mode, request.dataPolicy]);
}

/** Fixture store with the same idempotency and version rules as the durable adapter. */
export class MemoryForecastStore implements ForecastStore {
  private readonly rows: StoredForecast[] = [];

  async publish(input: Omit<StoredForecast, "id" | "version" | "previousVersionId">): Promise<StoredForecast> {
    if (input.status === "published" &&
      (input.snapshot.missing.length || validateForecastValues(input.request, input.values).length ||
        input.publishedAt === null)) throw new Error("INCOMPLETE_FORECAST");
    if (input.status === "incomplete" && (input.values.length || input.publishedAt !== null)) {
      throw new Error("INVALID_INCOMPLETE_FORECAST");
    }
    const existing = this.rows.find((row) => row.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const previous = this.rows.filter((row) => seriesKey(row.request) === seriesKey(input.request)).at(-1);
    const row = structuredClone({
      ...input, id: crypto.randomUUID(), version: (previous?.version ?? 0) + 1,
      previousVersionId: previous?.id ?? null,
    });
    this.rows.push(row);
    return structuredClone(row);
  }

  async list(filter?: {assetId?: string; issuedAt?: string; mode?: ForecastRequest["mode"];
    horizonHours?: 24 | 48}): Promise<StoredForecast[]> {
    return structuredClone(this.rows.filter((row) =>
      (!filter?.assetId || row.request.assetIds.includes(filter.assetId)) &&
      (!filter?.issuedAt || row.request.issuedAt === filter.issuedAt) &&
      (!filter?.mode || row.request.mode === filter.mode) &&
      (!filter?.horizonHours || row.request.horizonHours === filter.horizonHours)));
  }
}
