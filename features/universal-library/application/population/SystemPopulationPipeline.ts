import { ISystemDiscoveryProvider, DiscoveryQueryOptions, SystemDiscoverySeed } from "../../domain/discovery";
import { SystemPopulationPlanner, PlannerOptions } from "./SystemPopulationPlanner";
import { SystemPopulationBridge, StagingBridgeOptions } from "./SystemPopulationBridge";
import { IUniversalLibraryRepository } from "../../domain/repositories/UniversalLibraryRepository";

export interface PopulationRunInput {
  prompt: string;
  domainHint?: string | null;
  categoryHint?: string | null;
  targetMarket?: string | null;
  maxComponents?: number;
  sourceId?: string;
  plannerOptions?: PlannerOptions;
}

export interface CandidateSummary {
  componentKey: string;
  nameEn: string;
  componentType: "PRODUCT" | "SERVICE";
  manufacturer: string | null;
  modelNumber: string | null;
  mpn: string | null;
  evidenceUrl: string | null;
  status: string;
  ingestionRecordId: string | null;
  errorMessage: string | null;
}

export interface PopulationRunSummary {
  runId: string;
  status: "COMPLETED" | "FAILED" | "PARTIAL";
  query: {
    prompt: string;
    domainHint: string | null;
    targetMarket: string | null;
  };
  seed: {
    id: string;
    nameEn: string;
    seedType: string;
    confidence: number;
  };
  counts: {
    discoveredComponentsCount: number;
    plannedWorkItemsCount: number;
    stagedRecordsCount: number;
    duplicateRecordsCount: number;
    needsReviewCount: number;
    rejectedCount: number;
    publishedCount: number; // Always 0 in this slice!
  };
  evidenceUrls: string[];
  stagedCandidates: CandidateSummary[];
  errors: string[];
}

export class SystemPopulationPipeline {
  private readonly planner: SystemPopulationPlanner;
  private readonly bridge: SystemPopulationBridge;

  constructor(
    private readonly provider: ISystemDiscoveryProvider,
    private readonly repository: IUniversalLibraryRepository
  ) {
    this.planner = new SystemPopulationPlanner();
    this.bridge = new SystemPopulationBridge(repository);
  }

  public async runPopulation(input: PopulationRunInput): Promise<PopulationRunSummary> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const errors: string[] = [];

    let seed: SystemDiscoverySeed;
    try {
      const discoveryOptions: DiscoveryQueryOptions = {
        prompt: input.prompt,
        domainHint: input.domainHint,
        categoryHint: input.categoryHint,
        targetMarket: input.targetMarket,
        maxComponents: input.maxComponents,
      };
      seed = await this.provider.discoverSystem(discoveryOptions);
    } catch (err: any) {
      return {
        runId,
        status: "FAILED",
        query: {
          prompt: input.prompt,
          domainHint: input.domainHint || null,
          targetMarket: input.targetMarket || null,
        },
        seed: {
          id: "none",
          nameEn: "Discovery Failed",
          seedType: "SYSTEM",
          confidence: 0,
        },
        counts: {
          discoveredComponentsCount: 0,
          plannedWorkItemsCount: 0,
          stagedRecordsCount: 0,
          duplicateRecordsCount: 0,
          needsReviewCount: 0,
          rejectedCount: 0,
          publishedCount: 0,
        },
        evidenceUrls: [],
        stagedCandidates: [],
        errors: [err.message || "Discovery provider failed."],
      };
    }

    // 2. Plan population work items using PIC-03A1 planner
    let workItems;
    try {
      workItems = this.planner.plan(seed, input.plannerOptions);
    } catch (err: any) {
      return {
        runId,
        status: "FAILED",
        query: {
          prompt: input.prompt,
          domainHint: input.domainHint || null,
          targetMarket: input.targetMarket || null,
        },
        seed: {
          id: seed.id,
          nameEn: seed.nameEn,
          seedType: seed.seedType,
          confidence: seed.confidence,
        },
        counts: {
          discoveredComponentsCount: seed.components.length,
          plannedWorkItemsCount: 0,
          stagedRecordsCount: 0,
          duplicateRecordsCount: 0,
          needsReviewCount: 0,
          rejectedCount: 0,
          publishedCount: 0,
        },
        evidenceUrls: seed.evidence.map((e) => e.url),
        stagedCandidates: [],
        errors: [err.message || "Planning work items failed."],
      };
    }

    // 3. Stage work items via bridge
    const stagingOptions: StagingBridgeOptions = {
      sourceId: input.sourceId || "web_search_discovery",
      acquisitionRunId: runId,
    };

    const bridgeResults = await this.bridge.stageWorkItems(workItems, stagingOptions);

    // 4. Aggregate counts and summaries
    let stagedRecordsCount = 0;
    let duplicateRecordsCount = 0;
    let needsReviewCount = 0;
    let rejectedCount = 0;

    const stagedCandidates: CandidateSummary[] = workItems.map((wi) => {
      const bRes = bridgeResults.find((r) => r.workItemId === wi.id);
      const status = bRes?.ingestionStatus || "UNKNOWN";

      if (bRes?.disposition === "DUPLICATE") duplicateRecordsCount++;
      if (status === "NEEDS_REVIEW" || status === "MATCHED") needsReviewCount++;
      if (status === "REJECTED" || status === "FAILED") rejectedCount++;
      if (bRes?.disposition === "NEW" || bRes?.disposition === "CHANGED") stagedRecordsCount++;

      if (bRes?.errorMessage) {
        errors.push(`[${wi.componentKey}] ${bRes.errorMessage}`);
      }

      const primaryEv = wi.componentEvidence[0] || wi.seedEvidence[0];

      return {
        componentKey: wi.componentKey,
        nameEn: wi.nameEn,
        componentType: wi.componentType,
        manufacturer: wi.identityHints?.manufacturerHint || null,
        modelNumber: wi.identityHints?.modelNumber || null,
        mpn: wi.identityHints?.mpn || null,
        evidenceUrl: primaryEv?.url || null,
        status,
        ingestionRecordId: bRes?.ingestionRecordId || null,
        errorMessage: bRes?.errorMessage || null,
      };
    });

    // Collect all evidence URLs across seed and components
    const evidenceSet = new Set<string>();
    for (const ev of seed.evidence) {
      if (ev.url) evidenceSet.add(ev.url);
    }
    for (const comp of seed.components) {
      for (const ev of comp.evidence) {
        if (ev.url) evidenceSet.add(ev.url);
      }
    }

    const overallStatus =
      rejectedCount === workItems.length && workItems.length > 0
        ? "FAILED"
        : rejectedCount > 0
        ? "PARTIAL"
        : "COMPLETED";

    return {
      runId,
      status: overallStatus,
      query: {
        prompt: input.prompt,
        domainHint: input.domainHint || null,
        targetMarket: input.targetMarket || null,
      },
      seed: {
        id: seed.id,
        nameEn: seed.nameEn,
        seedType: seed.seedType,
        confidence: seed.confidence,
      },
      counts: {
        discoveredComponentsCount: seed.components.length,
        plannedWorkItemsCount: workItems.length,
        stagedRecordsCount,
        duplicateRecordsCount,
        needsReviewCount,
        rejectedCount,
        publishedCount: 0, // ALWAYS 0! Direct publication is prohibited.
      },
      evidenceUrls: Array.from(evidenceSet),
      stagedCandidates,
      errors,
    };
  }
}
