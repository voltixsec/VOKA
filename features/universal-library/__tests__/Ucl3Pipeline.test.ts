import { describe, it, expect, beforeEach } from "vitest";
import {
  IngestSourceRecord,
  ProcessIngestionBatch,
  NormalizationPipelineService,
  IdentityResolutionService,
  UniversalSource,
  UniversalIngestionRecord,
  UniversalCatalogItem,
  IUniversalLibraryRepository,
} from "../index";

class InMemoryUniversalLibraryRepository implements Partial<IUniversalLibraryRepository> {
  public sources: Map<string, UniversalSource> = new Map();
  public ingestionRecords: Map<string, UniversalIngestionRecord> = new Map();
  public items: Map<string, UniversalCatalogItem> = new Map();

  async getSourceById(sourceId: string) {
    return this.sources.get(sourceId) || null;
  }

  async getIngestionRecordBySourceExternalId(sourceId: string, sourceExternalId: string) {
    for (const rec of this.ingestionRecords.values()) {
      if (rec.sourceId === sourceId && rec.sourceExternalId === sourceExternalId) {
        return rec;
      }
    }
    return null;
  }

  async saveIngestionRecord(input: any) {
    const existing = await this.getIngestionRecordBySourceExternalId(input.sourceId, input.sourceExternalId);

    const record = new UniversalIngestionRecord({
      id: existing?.id || `rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourceId: input.sourceId,
      sourceExternalId: input.sourceExternalId,
      entityType: input.entityType || "ITEM",
      rawPayload: input.rawPayload,
      payloadHash: input.payloadHash,
      status: input.status,
      normalizedData: input.normalizedData || null,
      matchedItemId: input.matchedItemId || null,
      errorMessage: input.errorMessage || null,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    });

    this.ingestionRecords.set(record.id, record);
    return record;
  }

  async getPendingIngestionRecords(limit = 50) {
    const pending: UniversalIngestionRecord[] = [];
    for (const rec of this.ingestionRecords.values()) {
      if (["RECEIVED", "NORMALIZED", "MATCHED"].includes(rec.status)) {
        pending.push(rec);
      }
      if (pending.length >= limit) break;
    }
    return pending;
  }

  async updateIngestionRecordStatus(id: string, status: any, extra?: any) {
    const existing = this.ingestionRecords.get(id);
    if (!existing) throw new Error("Record not found");

    const updated = new UniversalIngestionRecord({
      ...existing,
      status,
      normalizedData: extra?.normalizedData !== undefined ? extra.normalizedData : existing.normalizedData,
      matchedItemId: extra?.matchedItemId !== undefined ? extra.matchedItemId : existing.matchedItemId,
      errorMessage: extra?.errorMessage !== undefined ? extra.errorMessage : existing.errorMessage,
      processedAt: extra?.processedAt !== undefined ? extra.processedAt : existing.processedAt,
      updatedAt: new Date(),
    });

    this.ingestionRecords.set(id, updated);
    return updated;
  }

  async publishIngestionRecord(input: any) {
    const rec = this.ingestionRecords.get(input.ingestionRecordId);
    if (!rec) throw new Error("Record not found");

    let isNewItem = false;
    let item = input.matchedItemId ? this.items.get(input.matchedItemId) : null;

    if (!item) {
      isNewItem = true;
      item = new UniversalCatalogItem({
        id: `item-${Date.now()}`,
        type: "PRODUCT",
        name: input.normalizedPayload.name,
        nameAr: input.normalizedPayload.nameAr,
        nameEn: input.normalizedPayload.nameEn,
        searchName: input.normalizedPayload.name.toLowerCase(),
        description: input.normalizedPayload.description,
        descriptionAr: input.normalizedPayload.descriptionAr,
        descriptionEn: input.normalizedPayload.descriptionEn,
        categoryId: null,
        manufacturerId: null,
        brandId: null,
        familyId: null,
        modelNumber: input.normalizedPayload.modelNumber,
        variantName: input.normalizedPayload.variantName,
        parentId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      this.items.set(item.id, item);
    }

    await this.updateIngestionRecordStatus(rec.id, "PUBLISHED", {
      matchedItemId: item.id,
      processedAt: new Date(),
    });

    return { item, isNewItem };
  }

  async lookupByIdentifier() { return null; }
  async searchItems() { return { items: [], total: 0 }; }
}

describe("UCL-3 Pipeline Core Suite (Synthetic Data)", () => {
  let repo: InMemoryUniversalLibraryRepository;
  let activeSource: UniversalSource;

  beforeEach(() => {
    repo = new InMemoryUniversalLibraryRepository();
    activeSource = new UniversalSource({
      id: "src-partner-1",
      name: "Partner Feed Alpha",
      type: "SUPPLIER_FEED",
      verificationStatus: "SOURCE_VERIFIED",
      isActive: true,
      trustScore: 0.9,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repo.sources.set(activeSource.id, activeSource);
  });

  it("1. Ingestion is strictly idempotent for identical repeated payloads", async () => {
    const ingestUseCase = new IngestSourceRecord(repo as any);

    const payload = {
      name: "Hikvision 4K Dome Camera",
      modelNumber: "DS-2CD2143G0-I",
      identifiers: [{ identifierType: "GTIN_13", value: "6931847101234" }],
    };

    const firstResult = await ingestUseCase.execute({
      sourceId: activeSource.id,
      sourceExternalId: "ext-prod-999",
      rawPayload: payload,
    });

    expect(firstResult.isNewRecord).toBe(true);
    expect(firstResult.isDuplicatePayload).toBe(false);

    const secondResult = await ingestUseCase.execute({
      sourceId: activeSource.id,
      sourceExternalId: "ext-prod-999",
      rawPayload: payload,
    });

    expect(secondResult.isNewRecord).toBe(false);
    expect(secondResult.isDuplicatePayload).toBe(true);
    expect(secondResult.ingestionRecord.id).toBe(firstResult.ingestionRecord.id);
  });

  it("2. Payload changes update payloadHash and re-trigger resolution lifecycle", async () => {
    const ingestUseCase = new IngestSourceRecord(repo as any);

    const initialPayload = { name: "Initial Product Name" };
    const updatedPayload = { name: "Updated Product Name with enriched details" };

    const first = await ingestUseCase.execute({
      sourceId: activeSource.id,
      sourceExternalId: "ext-prod-888",
      rawPayload: initialPayload,
    });

    expect(first.isDuplicatePayload).toBe(false);

    const second = await ingestUseCase.execute({
      sourceId: activeSource.id,
      sourceExternalId: "ext-prod-888",
      rawPayload: updatedPayload,
    });

    expect(second.isDuplicatePayload).toBe(false);
    expect(second.ingestionRecord.payloadHash).not.toBe(first.ingestionRecord.payloadHash);
  });

  it("3. Reject ingestion if source is inactive or untrusted", async () => {
    const inactiveSource = new UniversalSource({
      id: "src-inactive",
      name: "Disabled Feed",
      type: "UNAPPROVED_SCRAPER",
      verificationStatus: "UNVERIFIED",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repo.sources.set(inactiveSource.id, inactiveSource);

    const ingestUseCase = new IngestSourceRecord(repo as any);

    await expect(
      ingestUseCase.execute({
        sourceId: inactiveSource.id,
        sourceExternalId: "ext-1",
        rawPayload: { name: "Test" },
      })
    ).rejects.toThrow("currently inactive");
  });

  it("4. Normalization cleans whitespace, normalizes casing & UCL-2 identifiers", () => {
    const raw = {
      name: "  Samsung   Monitor  \u0041\u030a ",
      manufacturerName: "  Samsung ",
      modelNumber: "  s24f350  ",
      identifiers: [
        { identifierType: "GTIN_13", value: " 8806088234123 " },
        { identifierType: "MPN", value: " s24f350 " },
      ],
      attributes: [
        { code: "SCREEN_SIZE", name: "Screen Size", dataType: "NUMBER", value: 24, unit: " INCHES " },
      ],
    };

    const norm = NormalizationPipelineService.normalize(raw);

    expect(norm.name).toBe("Samsung Monitor \u00C5");
    expect(norm.manufacturerName).toBe("Samsung");
    expect(norm.normalizedModelNumber).toBe("S24F350");
    expect(norm.identifiers[0].normalizedValue).toBe("8806088234123");
    expect(norm.identifiers[1].normalizedValue).toBe("S24F350");
  });

  it("5. Identity resolution prefers exact global identifier (GTIN) over weak matches", async () => {
    const payload = NormalizationPipelineService.normalize({
      name: "Different Item Name",
      identifiers: [{ identifierType: "GTIN_13", value: "6931847101234" }],
    });

    const res = await IdentityResolutionService.resolveIdentity(
      payload,
      activeSource.id,
      "ext-123",
      {
        findItemByGlobalIdentifier: async () => ({ id: "canonical-item-gtin" }),
      }
    );

    expect(res.status).toBe("MATCHED");
    expect(res.matchedItemId).toBe("canonical-item-gtin");
    expect(res.confidenceReason).toBe("EXACT_GLOBAL_IDENTIFIER");
  });

  it("6. Ambiguous weak matches result in NEEDS_REVIEW state instead of auto-merging", async () => {
    const payload = NormalizationPipelineService.normalize({
      name: "Generic 1080p Camera",
    });

    const res = await IdentityResolutionService.resolveIdentity(
      payload,
      activeSource.id,
      "ext-123",
      {
        findItemsByConservativeName: async () => [
          { id: "cam-1" },
          { id: "cam-2" },
        ],
      }
    );

    expect(res.status).toBe("NEEDS_REVIEW");
    expect(res.matchedItemId).toBeNull();
    expect(res.confidenceReason).toBe("AMBIGUOUS_MULTIPLE_MATCHES");
  });

  it("7. ProcessIngestionBatch processes pending records and publishes canonically", async () => {
    const ingestUseCase = new IngestSourceRecord(repo as any);
    const processBatchUseCase = new ProcessIngestionBatch(repo as any);

    await ingestUseCase.execute({
      sourceId: activeSource.id,
      sourceExternalId: "ext-batch-1",
      rawPayload: { name: "Batch Product 1", modelNumber: "MOD-1" },
    });

    const summary = await processBatchUseCase.execute({ batchSize: 10 });

    expect(summary.processedCount).toBe(1);
    expect(summary.publishedCount).toBe(1);
    expect(summary.recordIds).toHaveLength(1);

    const publishedRecord = repo.ingestionRecords.get(summary.recordIds[0]);
    expect(publishedRecord?.status).toBe("PUBLISHED");
    expect(publishedRecord?.matchedItemId).toBeDefined();
  });
});
