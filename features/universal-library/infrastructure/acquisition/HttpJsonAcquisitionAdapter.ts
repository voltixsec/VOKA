import { AcquisitionEnvelope, AcquisitionPage, GovernedAcquisitionSource, IExternalAcquisitionAdapter } from "../../domain";
import { SafeHttpJsonClient } from "./SafeHttpJsonClient";

const ALLOWED_FIELDS = new Set(["name", "nameAr", "nameEn", "type", "description", "descriptionAr", "descriptionEn", "modelNumber", "manufacturerName", "brandName", "categoryName", "aliases", "identifiers", "attributes"]);

export class HttpJsonAcquisitionAdapter implements IExternalAcquisitionAdapter {
  constructor(private readonly client = new SafeHttpJsonClient()) {}
  public async acquire(input: { source: GovernedAcquisitionSource; limit: number; cursor?: string }): Promise<AcquisitionPage> {
    const endpoint = new URL(input.source.url!);
    endpoint.searchParams.set("limit", String(input.limit));
    if (input.cursor) endpoint.searchParams.set("cursor", input.cursor);
    const result = await this.client.getJson({ url: endpoint.toString(), timeoutMs: input.source.acquisitionTimeoutMs, maxRetries: input.source.maxRetries });
    const root = result.value;
    const rawRecords = Array.isArray(root) ? root : this.isPlainObject(root) && Array.isArray(root.records) ? root.records : null;
    if (!rawRecords) throw new Error("External response must contain a records array.");
    if (rawRecords.length > input.limit) throw new Error("External source exceeded the requested record limit.");
    const records = rawRecords.map((record, index) => ({
      ...this.toEnvelope(record, result.finalUrl, index),
      attribution: input.source.attributionRequired ? input.source.name : undefined,
      licenseReferenceUrl: input.source.licenseReferenceUrl ?? undefined,
    }));
    const continuationCursor = !Array.isArray(root) && this.isPlainObject(root) && typeof root.nextCursor === "string" && root.nextCursor.length <= 500 ? root.nextCursor : undefined;
    return { records, continuationCursor, retryCount: result.retryCount };
  }
  private toEnvelope(value: unknown, canonicalUrl: string, index: number): AcquisitionEnvelope {
    if (!this.isPlainObject(value)) throw new Error("External record is invalid.");
    const externalRecordId = typeof value.id === "string" ? value.id.trim() : typeof value.externalId === "string" ? value.externalId.trim() : "";
    if (!externalRecordId || externalRecordId.length > 500) throw new Error(`External record ${index} has no bounded identity.`);
    const rawPayload: Record<string, unknown> = Object.create(null);
    for (const [key, field] of Object.entries(value)) {
      if (!ALLOWED_FIELDS.has(key)) continue;
      const encoded = JSON.stringify(field);
      if (encoded && Buffer.byteLength(encoded, "utf8") <= 64_000) rawPayload[key] = structuredClone(field);
    }
    if (typeof rawPayload.name !== "string" || !rawPayload.name.trim() || rawPayload.name.length > 500) throw new Error(`External record ${index} has an invalid name.`);
    return { externalRecordId, rawPayload, canonicalSourceUrl: canonicalUrl, fetchedAt: new Date() };
  }
  private isPlainObject(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  }
}
