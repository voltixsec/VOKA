import { describe, it, expect, beforeEach, vi } from "vitest";
import { SystemPopulationPipeline } from "../../application/population/SystemPopulationPipeline";
import {
  ISystemDiscoveryProvider,
  SystemDiscoverySeed,
  DiscoveryEvidence,
  SystemComponent,
} from "../../domain/discovery";
import { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";
import { UniversalIngestionRecord, UniversalSource } from "../../domain/entities";

describe("SystemPopulationPipeline", () => {
  let mockProvider: ISystemDiscoveryProvider;
  let mockRepo: Partial<IUniversalLibraryRepository>;
  let ingestionStore: Map<string, UniversalIngestionRecord>;

  beforeEach(() => {
    ingestionStore = new Map();

    const mockSource = new UniversalSource({
      id: "web_search_discovery",
      name: "Web Search Discovery",
      type: "AI_WEB_SEARCH",
      verificationStatus: "SOURCE_VERIFIED",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockRepo = {
      getSourceById: vi.fn().mockResolvedValue(mockSource),
      getIngestionRecordBySourceExternalId: vi
        .fn()
        .mockImplementation(async (sourceId: string, extId: string) => {
          return ingestionStore.get(`${sourceId}:${extId}`) || null;
        }),
      saveIngestionRecord: vi.fn().mockImplementation(async (input: any) => {
        const id = `ir-${input.sourceExternalId}`;
        const record = new UniversalIngestionRecord({
          id,
          sourceId: input.sourceId,
          sourceExternalId: input.sourceExternalId,
          entityType: input.entityType,
          rawPayload: input.rawPayload,
          payloadHash: input.payloadHash,
          status: input.status,
          normalizedData: input.normalizedData,
          errorMessage: input.errorMessage,
          canonicalSourceUrl: input.canonicalSourceUrl,
          attributionText: input.attributionText,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        ingestionStore.set(`${input.sourceId}:${input.sourceExternalId}`, record);
        return record;
      }),
      findActiveItemIdsByIdentifier: vi.fn().mockResolvedValue([]),
      findActiveItemIdsByManufacturerIdentifier: vi.fn().mockResolvedValue([]),
      findActiveItemIdsByManufacturerModel: vi.fn().mockResolvedValue([]),
      findActiveItemIdsByName: vi.fn().mockResolvedValue([]),
    };

    const mockSeed = new SystemDiscoverySeed({
      id: "cctv-enterprise-system",
      seedType: "SYSTEM",
      nameEn: "Enterprise IP Video Surveillance Solution",
      confidence: 0.95,
      evidence: [
        new DiscoveryEvidence({
          url: "https://www.example-surveillance.com/solutions/enterprise",
          title: "Enterprise Surveillance System Overview",
          publisher: "Surveillance Corp",
          sourceType: "MANUFACTURER_DATASHEET",
          claimSupport: ["Complete enterprise surveillance architecture"],
        }),
      ],
      components: [
        new SystemComponent({
          key: "camera_dome_4k",
          componentType: "PRODUCT",
          nameEn: "4K Vandal Dome Camera",
          purpose: "Outdoor perimeter monitoring",
          categoryHint: "SECURITY_CAMERAS",
          identityHints: {
            manufacturerHint: "VisionTech",
            brandHint: "ProDome",
            modelNumber: "VT-4K-D32",
            mpn: "VT-4K-D32-IR",
          },
          specificationHints: ["4K UHD Resolution", "IK10 Vandal Proof"],
          confidence: 0.92,
          evidence: [
            new DiscoveryEvidence({
              url: "https://www.example-surveillance.com/products/VT-4K-D32",
              title: "VT-4K-D32 Datasheet",
              publisher: "VisionTech",
              sourceType: "MANUFACTURER_DATASHEET",
              claimSupport: ["Exact specs for VT-4K-D32"],
            }),
          ],
        }),
        new SystemComponent({
          key: "nvr_32ch_4k",
          componentType: "PRODUCT",
          nameEn: "32-Channel 4K NVR",
          purpose: "Centralized IP video recording",
          categoryHint: "RECORDERS",
          identityHints: {
            manufacturerHint: "VisionTech",
            brandHint: "ProRecord",
            modelNumber: "VT-NVR32-4K",
            mpn: "VT-NVR32-4K-16P",
          },
          specificationHints: ["32 Channels", "16 PoE Ports"],
          confidence: 0.9,
          evidence: [
            new DiscoveryEvidence({
              url: "https://www.example-surveillance.com/products/VT-NVR32-4K",
              title: "VT-NVR32-4K Datasheet",
              publisher: "VisionTech",
              sourceType: "MANUFACTURER_DATASHEET",
              claimSupport: ["Exact specs for VT-NVR32-4K"],
            }),
          ],
        }),
      ],
    });

    mockProvider = {
      discoverSystem: vi.fn().mockResolvedValue(mockSeed),
    };
  });

  it("executes full population run and stages candidates into UniversalIngestionRecord", async () => {
    const pipeline = new SystemPopulationPipeline(
      mockProvider,
      mockRepo as IUniversalLibraryRepository
    );

    const summary = await pipeline.runPopulation({
      prompt: "Enterprise IP CCTV System",
      domainHint: "Security",
    });

    expect(summary.status).toBe("COMPLETED");
    expect(summary.query.prompt).toBe("Enterprise IP CCTV System");
    expect(summary.seed.nameEn).toBe("Enterprise IP Video Surveillance Solution");

    expect(summary.counts.discoveredComponentsCount).toBe(2);
    expect(summary.counts.plannedWorkItemsCount).toBe(2);
    expect(summary.counts.stagedRecordsCount).toBe(2);
    expect(summary.counts.publishedCount).toBe(0);

    expect(summary.evidenceUrls).toContain(
      "https://www.example-surveillance.com/solutions/enterprise"
    );
    expect(summary.evidenceUrls).toContain(
      "https://www.example-surveillance.com/products/VT-4K-D32"
    );

    expect(summary.stagedCandidates).toHaveLength(2);
    expect(summary.stagedCandidates[0].componentKey).toBe("camera_dome_4k");
    expect(summary.stagedCandidates[0].modelNumber).toBe("VT-4K-D32");
    expect(summary.stagedCandidates[0].mpn).toBe("VT-4K-D32-IR");

    expect(mockRepo.saveIngestionRecord).toHaveBeenCalledTimes(2);
    const calls = (mockRepo.saveIngestionRecord as any).mock.calls;
    for (const call of calls) {
      const rawPayload = call[0].rawPayload;
      expect(rawPayload.componentEvidence).toBeDefined();
      expect(rawPayload.componentEvidence.length).toBeGreaterThan(0);
      expect(rawPayload.seedEvidence).toBeDefined();
      expect(rawPayload.seedEvidence.length).toBeGreaterThan(0);
      expect(rawPayload.componentEvidence[0].url).toBeDefined();
      expect(rawPayload.componentEvidence[0].title).toBeDefined();
      expect(rawPayload.componentEvidence[0].publisher).toBeDefined();
      expect(rawPayload.componentEvidence[0].claimSupport).toBeDefined();
    }
  });

  it("handles duplicate execution idempotently without corrupting staging", async () => {
    const pipeline = new SystemPopulationPipeline(
      mockProvider,
      mockRepo as IUniversalLibraryRepository
    );

    const summary1 = await pipeline.runPopulation({ prompt: "CCTV System" });
    expect(summary1.counts.stagedRecordsCount).toBe(2);
    expect(summary1.counts.duplicateRecordsCount).toBe(0);

    const summary2 = await pipeline.runPopulation({ prompt: "CCTV System" });
    expect(summary2.counts.stagedRecordsCount).toBe(0);
    expect(summary2.counts.duplicateRecordsCount).toBe(2);
  });

  it("returns status FAILED if discovery provider throws an error", async () => {
    const failingProvider: ISystemDiscoveryProvider = {
      discoverSystem: vi.fn().mockRejectedValue(new Error("Network timeout contacting search engine")),
    };

    const pipeline = new SystemPopulationPipeline(
      failingProvider,
      mockRepo as IUniversalLibraryRepository
    );

    const summary = await pipeline.runPopulation({ prompt: "Fail query" });
    expect(summary.status).toBe("FAILED");
    expect(summary.counts.discoveredComponentsCount).toBe(0);
    expect(summary.errors[0]).toMatch(/Network timeout/);
  });

  it("returns null ingestionRecordId and explicit error when bridge staging fails", async () => {
    const failingRepo = {
      ...mockRepo,
      getSourceById: vi.fn().mockRejectedValue(new Error("Database connection lost")),
    };

    const pipeline = new SystemPopulationPipeline(
      mockProvider,
      failingRepo as IUniversalLibraryRepository
    );

    const summary = await pipeline.runPopulation({ prompt: "CCTV System" });
    expect(summary.status).toBe("FAILED");
    expect(summary.counts.rejectedCount).toBe(2);
    expect(summary.counts.stagedRecordsCount).toBe(0);
    expect(summary.stagedCandidates).toHaveLength(2);
    for (const candidate of summary.stagedCandidates) {
      expect(candidate.ingestionRecordId).toBeNull();
      expect(candidate.status).toBe("FAILED");
      expect(candidate.errorMessage).toBeTruthy();
    }
  });

  it("preserves exact identity strings without mutation", async () => {
    const exactSeed = new SystemDiscoverySeed({
      id: "exact-identity-seed",
      seedType: "SYSTEM",
      nameEn: "Exact Identity System",
      confidence: 0.9,
      evidence: [
        new DiscoveryEvidence({
          url: "https://example.com/spec",
          title: "Spec Sheet",
          publisher: "Vendor",
          sourceType: "MANUFACTURER_DATASHEET",
          claimSupport: ["Valid evidence"],
        }),
      ],
      components: [
        new SystemComponent({
          key: "exact-comp",
          componentType: "PRODUCT",
          nameEn: "Exact Component",
          purpose: "Test",
          confidence: 0.9,
          identityHints: {
            manufacturerHint: "Acme Corp",
            brandHint: "Pro-line",
            modelNumber: "ACME-CAM/v2.1_4K-x10",
            mpn: "ACME-CAM-4K-x10-EU#01",
            sku: "SKU-123",
            gtin: "GTIN-456",
          },
          evidence: [
            new DiscoveryEvidence({
              url: "https://example.com/cam-spec",
              title: "Cam Spec",
              publisher: "Vendor",
              sourceType: "MANUFACTURER_DATASHEET",
              claimSupport: ["Valid evidence"],
            }),
          ],
        }),
      ],
    });

    const exactProvider = {
      discoverSystem: vi.fn().mockResolvedValue(exactSeed),
    };

    const pipeline = new SystemPopulationPipeline(
      exactProvider,
      mockRepo as IUniversalLibraryRepository
    );

    const summary = await pipeline.runPopulation({ prompt: "Exact test" });
    expect(summary.stagedCandidates[0].modelNumber).toBe("ACME-CAM/v2.1_4K-x10");
    expect(summary.stagedCandidates[0].mpn).toBe("ACME-CAM-4K-x10-EU#01");
  });

  it("maintains truthful publishedCount of zero with no direct publication path", async () => {
    const pipeline = new SystemPopulationPipeline(
      mockProvider,
      mockRepo as IUniversalLibraryRepository
    );

    const summary = await pipeline.runPopulation({ prompt: "CCTV System" });
    expect(summary.counts.publishedCount).toBe(0);
    expect(summary.stagedCandidates.every((c) => c.status !== "PUBLISHED")).toBe(true);
  });
});
