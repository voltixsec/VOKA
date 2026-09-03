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
        const id = `ir-${Date.now()}-${Math.random()}`;
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
    expect(summary.counts.publishedCount).toBe(0); // STRICTLY ZERO IN VARIANT!

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

    // Verify stored ingestion record
    expect(mockRepo.saveIngestionRecord).toHaveBeenCalledTimes(2);
  });

  it("handles duplicate execution idempotently without corrupting staging", async () => {
    const pipeline = new SystemPopulationPipeline(
      mockProvider,
      mockRepo as IUniversalLibraryRepository
    );

    // First run
    const summary1 = await pipeline.runPopulation({ prompt: "CCTV System" });
    expect(summary1.counts.stagedRecordsCount).toBe(2);
    expect(summary1.counts.duplicateRecordsCount).toBe(0);

    // Second identical run
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
});
