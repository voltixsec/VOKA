import { describe, expect, it, vi } from "vitest";

import {
  BULK_IMPORT_SCHEMA_VERSION,
  type BulkImportRecordEnvelope,
} from "../../../domain/bulk-import/BulkImportContract";
import type { UniversalIngestionRecord } from "../../../domain/entities/UniversalIngestionRecord";
import type { IUniversalLibraryRepository } from "../../../domain/repositories/UniversalLibraryRepository";
import {
  InMemoryJsonlLineReader,
} from "../../../infrastructure/bulk-import/jsonl/JsonlLineReader";
import {
  JsonlProcessor,
} from "../../../infrastructure/bulk-import/jsonl/JsonlProcessor";
import {
  BulkImportStagingService,
  computeBulkImportContentHash,
} from "../BulkImportStagingService";

function envelope(
  overrides: Partial<BulkImportRecordEnvelope> = {},
): BulkImportRecordEnvelope {
  return {
    schemaVersion: BULK_IMPORT_SCHEMA_VERSION,
    entityType: "PRODUCT_MODEL",
    externalKey: "manufacturer:model-001",
    payload: {
      name: "Model 001",
    },
    ...overrides,
  };
}

function ingestionRecord(
  overrides: Partial<UniversalIngestionRecord> = {},
): UniversalIngestionRecord {
  return {
    id: "ingestion-1",
    sourceId: "bulk-security",
    sourceExternalId: "manufacturer:model-001",
    entityType: "PRODUCT_MODEL",
    rawPayload: {},
    payloadHash: "hash",
    status: "RECEIVED",
    normalizedData: null,
    matchedItemId: null,
    errorMessage: null,
    retryCount: 0,
    processingStartedAt: null,
    processedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UniversalIngestionRecord;
}

function createRepository() {
  const getSourceById = vi.fn().mockResolvedValue({
    id: "bulk-security",
    name: "Bulk Security Dataset",
    isActive: true,
  });

  const getIngestionRecordBySourceExternalId =
    vi.fn().mockResolvedValue(null);

  const saveIngestionRecord = vi.fn().mockImplementation(
    async (input) =>
      ingestionRecord({
        sourceId: input.sourceId,
        sourceExternalId: input.sourceExternalId,
        entityType: input.entityType,
        rawPayload: input.rawPayload,
        payloadHash: input.payloadHash,
        status: input.status,
        normalizedData: input.normalizedData ?? null,
        matchedItemId: input.matchedItemId ?? null,
        errorMessage: input.errorMessage ?? null,
      }),
  );

  const repository = {
    getSourceById,
    getIngestionRecordBySourceExternalId,
    saveIngestionRecord,
  } as unknown as IUniversalLibraryRepository;

  return {
    repository,
    getSourceById,
    getIngestionRecordBySourceExternalId,
    saveIngestionRecord,
  };
}

async function parsedStream(
  lines: readonly string[],
) {
  const processor = new JsonlProcessor();
  const reader = new InMemoryJsonlLineReader(lines);
  return processor.process(reader);
}

describe("BulkImportStagingService", () => {
  it("stages a new valid record as RECEIVED without normalization or publication", async () => {
    const {
      repository,
      saveIngestionRecord,
    } = createRepository();

    const service = new BulkImportStagingService(repository);

    const sourceEnvelope = envelope();

    const summary = await service.stage(
      await parsedStream([
        JSON.stringify(sourceEnvelope),
      ]),
      {
        sourceId: "bulk-security",
      },
    );

    expect(summary.totalRecords).toBe(1);
    expect(summary.validRecords).toBe(1);
    expect(summary.newRecords).toBe(1);
    expect(summary.changedRecords).toBe(0);
    expect(summary.unchangedRecords).toBe(0);
    expect(summary.invalidRecords).toBe(0);

    expect(saveIngestionRecord).toHaveBeenCalledTimes(1);

    const saved =
      saveIngestionRecord.mock.calls[0][0];

    expect(saved.status).toBe("RECEIVED");
    expect(saved.normalizedData).toBeNull();
    expect(saved.entityType).toBe("PRODUCT_MODEL");
    expect(saved.sourceExternalId)
      .toBe("manufacturer:model-001");
    expect(saved.rawPayload)
      .toEqual(sourceEnvelope);
  });

  it("accepts non-item entities such as SYSTEM and RELATION", async () => {
    const {
      repository,
      saveIngestionRecord,
    } = createRepository();

    const service = new BulkImportStagingService(repository);

    const system = envelope({
      entityType: "SYSTEM",
      externalKey: "system:ip-cctv",
      payload: {},
    });

    const relation = envelope({
      entityType: "RELATION",
      externalKey: "relation:camera:system",
      payload: {
        relationType: "COMPONENT_OF",
      },
    });

    const summary = await service.stage(
      await parsedStream([
        JSON.stringify(system),
        JSON.stringify(relation),
      ]),
      {
        sourceId: "bulk-security",
      },
    );

    expect(summary.newRecords).toBe(2);
    expect(saveIngestionRecord).toHaveBeenCalledTimes(2);
    expect(saveIngestionRecord.mock.calls[0][0].entityType)
      .toBe("SYSTEM");
    expect(saveIngestionRecord.mock.calls[1][0].entityType)
      .toBe("RELATION");
  });

  it("does not write an unchanged record when the content hash is identical", async () => {
    const {
      repository,
      getIngestionRecordBySourceExternalId,
      saveIngestionRecord,
    } = createRepository();

    const sourceEnvelope = envelope();
    const hash = computeBulkImportContentHash(sourceEnvelope);

    getIngestionRecordBySourceExternalId.mockResolvedValue(
      ingestionRecord({
        payloadHash: hash,
        status: "RECEIVED",
      }),
    );

    const service = new BulkImportStagingService(repository);

    const summary = await service.stage(
      await parsedStream([
        JSON.stringify(sourceEnvelope),
      ]),
      {
        sourceId: "bulk-security",
      },
    );

    expect(summary.unchangedRecords).toBe(1);
    expect(summary.newRecords).toBe(0);
    expect(summary.changedRecords).toBe(0);
    expect(saveIngestionRecord).not.toHaveBeenCalled();
  });

  it("ignores volatile observation timestamps for idempotency", () => {
    const first = envelope({
      observedAt: "2026-09-01T10:00:00Z",
      sourceUpdatedAt: "2026-09-01T09:00:00Z",
      evidence: [
        {
          url: "https://example.com/model",
          observedAt: "2026-09-01T10:00:00Z",
        },
      ],
    });

    const second = envelope({
      observedAt: "2026-09-04T10:00:00Z",
      sourceUpdatedAt: "2026-09-04T09:00:00Z",
      evidence: [
        {
          url: "https://example.com/model",
          observedAt: "2026-09-04T10:00:00Z",
        },
      ],
    });

    expect(computeBulkImportContentHash(first))
      .toBe(computeBulkImportContentHash(second));
  });

  it("stages changed content as NEEDS_REVIEW", async () => {
    const {
      repository,
      getIngestionRecordBySourceExternalId,
      saveIngestionRecord,
    } = createRepository();

    getIngestionRecordBySourceExternalId.mockResolvedValue(
      ingestionRecord({
        payloadHash: "different-existing-hash",
        matchedItemId: "item-123",
      }),
    );

    const service = new BulkImportStagingService(repository);

    const summary = await service.stage(
      await parsedStream([
        JSON.stringify(
          envelope({
            payload: {
              name: "Changed Model",
            },
          }),
        ),
      ]),
      {
        sourceId: "bulk-security",
      },
    );

    expect(summary.changedRecords).toBe(1);

    const saved =
      saveIngestionRecord.mock.calls[0][0];

    expect(saved.status).toBe("NEEDS_REVIEW");
    expect(saved.matchedItemId).toBe("item-123");
  });

  it("reports structurally invalid JSONL records without staging them", async () => {
    const {
      repository,
      saveIngestionRecord,
    } = createRepository();

    const service = new BulkImportStagingService(repository);

    const summary = await service.stage(
      await parsedStream([
        "{ malformed json",
        JSON.stringify(envelope()),
      ]),
      {
        sourceId: "bulk-security",
      },
    );

    expect(summary.totalRecords).toBe(2);
    expect(summary.invalidRecords).toBe(1);
    expect(summary.validRecords).toBe(1);
    expect(summary.newRecords).toBe(1);
    expect(summary.results[0].disposition).toBe("INVALID");
    expect(summary.results[0].lineNumber).toBe(1);
    expect(saveIngestionRecord).toHaveBeenCalledTimes(1);
  });

  it("rejects missing and inactive source registrations before staging", async () => {
    const missingRepo = {
      getSourceById: vi.fn().mockResolvedValue(null),
    } as unknown as IUniversalLibraryRepository;

    const missingService =
      new BulkImportStagingService(missingRepo);

    await expect(
      missingService.stage(
        await parsedStream([
          JSON.stringify(envelope()),
        ]),
        {
          sourceId: "missing-source",
        },
      ),
    ).rejects.toThrow("not found");

    const inactiveRepo = {
      getSourceById: vi.fn().mockResolvedValue({
        id: "inactive-source",
        name: "Inactive Source",
        isActive: false,
      }),
    } as unknown as IUniversalLibraryRepository;

    const inactiveService =
      new BulkImportStagingService(inactiveRepo);

    await expect(
      inactiveService.stage(
        await parsedStream([
          JSON.stringify(envelope()),
        ]),
        {
          sourceId: "inactive-source",
        },
      ),
    ).rejects.toThrow("inactive");
  });

  it("supports real object-shaped market relevance evidence in hash material", () => {
    const first = {
      schemaVersion: BULK_IMPORT_SCHEMA_VERSION,
      entityType: "PRODUCT_MODEL",
      externalKey:
        "model:dahua:dahua-wizmind-5-series-pro-8mp:ipc-hdbw4839r-zas-il-kuwait",
      payload: {
        name: "IPC-HDBW4839R-ZAS-IL",
      },
      observedAt: "2026-09-01T10:00:00Z",
      sourceUpdatedAt: "2026-09-01T09:00:00Z",
      marketRelevance: [
        {
          countryCode: "KW",
          regionCode: "MEA",
          relevance: "HIGH",
          claimType: "MANUFACTURER_REGIONAL_VARIANT",
          confidence: "HIGH",
          evidence: {
            sourceUrl:
              "https://www.dahuasecurity.com/mena/Products/All-Products/Network-Cameras/WizMind-5-Series/Pro/8MP",
            claim:
              "Official Dahua MEA page includes a Kuwait-suffixed model variant.",
          },
        },
      ],
    } as unknown as BulkImportRecordEnvelope;

    const second = {
      ...first,
      observedAt: "2026-09-04T10:00:00Z",
      sourceUpdatedAt: "2026-09-04T09:00:00Z",
    } as unknown as BulkImportRecordEnvelope;

    expect(() =>
      computeBulkImportContentHash(first),
    ).not.toThrow();

    expect(computeBulkImportContentHash(first))
      .toBe(computeBulkImportContentHash(second));
  });
});

