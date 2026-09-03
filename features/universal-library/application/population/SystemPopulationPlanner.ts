import {
  SystemDiscoverySeed,
  SystemComponent,
  DISCOVERY_COLLECTION_BOUNDS,
} from "../../domain/discovery";
import { PopulationWorkItem, WorkItemIntention } from "./PopulationWorkItem";

export interface PlannerOptions {
  maxWorkItemsBound?: number;
}

export class SystemPopulationPlanner {
  public static normalizeComponentKey(rawKey: string): string {
    return rawKey
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "_");
  }

  public plan(seed: SystemDiscoverySeed, options?: PlannerOptions): PopulationWorkItem[] {
    const maxBound = options?.maxWorkItemsBound ?? DISCOVERY_COLLECTION_BOUNDS.MAX_POPULATION_WORK_ITEMS;

    // 1. Map components to candidates and deduplicate deterministically using normalized component key
    const seenNormalizedKeys = new Set<string>();
    const uniqueComponents: SystemComponent[] = [];

    for (const comp of seed.components) {
      const normKey = SystemPopulationPlanner.normalizeComponentKey(comp.key);
      if (!seenNormalizedKeys.has(normKey)) {
        seenNormalizedKeys.add(normKey);
        uniqueComponents.push(comp);
      }
    }

    // 2. Check maximum bound - FAIL EXPLICITLY if bound exceeded (no silent truncation)
    if (uniqueComponents.length > maxBound) {
      throw new Error(
        `Maximum population work items bound exceeded: ${uniqueComponents.length} work items exceeds maximum allowed bound of ${maxBound}`
      );
    }

    // 3. Build work items
    const workItems: PopulationWorkItem[] = uniqueComponents.map((comp) => {
      const normKey = SystemPopulationPlanner.normalizeComponentKey(comp.key);
      const workItemId = `${seed.id}::wi::${normKey}`;

      const intention: WorkItemIntention =
        comp.componentType === "PRODUCT"
          ? "GLOBAL_PRODUCT_EXPANSION"
          : "SERVICE_POPULATION";

      // Component evidence vs seed evidence separation:
      // Component evidence is ONLY what is attached to the component.
      // System-level evidence does NOT automatically prove component facts.
      const componentEvidence = comp.evidence;
      const seedEvidence = seed.evidence;
      const evidenceDiscoveryRequired = componentEvidence.length === 0;

      // Localization state:
      const requiresArabicLocalization = comp.requiresArabicLocalization;

      return new PopulationWorkItem({
        id: workItemId,
        seedId: seed.id,
        seedType: seed.seedType,
        intention,
        componentKey: comp.key,
        normalizedComponentKey: normKey,
        componentType: comp.componentType,
        nameEn: comp.nameEn,
        nameAr: comp.nameAr,
        purpose: comp.purpose,
        categoryHint: comp.categoryHint,
        identityHints: comp.identityHints, // Preserved byte-for-byte!
        specificationHints: comp.specificationHints,
        dependencyHints: comp.dependencyHints,
        componentEvidence,
        seedEvidence,
        evidenceDiscoveryRequired,
        confidence: comp.confidence,
        marketRelevanceTargets: seed.marketRelevanceTargets,
        requiresArabicLocalization,
        createdAt: seed.discoveredAt,
      });
    });

    // 4. Ensure deterministic order regardless of input component order!
    // Sort work items by normalizedComponentKey alphabetically
    workItems.sort((a, b) => a.normalizedComponentKey.localeCompare(b.normalizedComponentKey));

    return workItems;
  }
}
