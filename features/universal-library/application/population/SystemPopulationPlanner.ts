import {
  SystemDiscoverySeed,
  SystemComponent,
  DISCOVERY_COLLECTION_BOUNDS,
} from "../../domain/discovery";
import { PopulationWorkItem, WorkItemIntention } from "./PopulationWorkItem";

export interface PlannerOptions {
  maxWorkItemsBound?: number;
}

function countPopulatedIdentityHints(comp: SystemComponent): number {
  if (!comp.identityHints) return 0;
  const hints = comp.identityHints;
  let count = 0;
  if (typeof hints.manufacturerHint === "string" && hints.manufacturerHint.trim()) count++;
  if (typeof hints.brandHint === "string" && hints.brandHint.trim()) count++;
  if (typeof hints.familyHint === "string" && hints.familyHint.trim()) count++;
  if (typeof hints.modelNumber === "string" && hints.modelNumber.trim()) count++;
  if (typeof hints.mpn === "string" && hints.mpn.trim()) count++;
  if (typeof hints.sku === "string" && hints.sku.trim()) count++;
  if (typeof hints.gtin === "string" && hints.gtin.trim()) count++;
  return count;
}

function canonicalPayloadSignature(comp: SystemComponent): string {
  return JSON.stringify({
    key: comp.key,
    type: comp.componentType,
    nameEn: comp.nameEn,
    nameAr: comp.nameAr,
    purpose: comp.purpose,
    category: comp.categoryHint,
    specs: comp.specificationHints,
    deps: comp.dependencyHints,
    identity: comp.identityHints,
    evidenceCount: comp.evidence.length,
    confidence: comp.confidence,
  });
}

/**
 * Compare two component candidates for deterministic duplicate resolution.
 * Precedence:
 * 1. Higher component confidence
 * 2. Greater number of component-level evidence references
 * 3. Greater number of populated identity hints
 * 4. Stable canonical payload string comparison
 */
function compareComponentCandidates(a: SystemComponent, b: SystemComponent): number {
  // 1. Higher confidence
  if (a.confidence !== b.confidence) {
    return b.confidence - a.confidence; // higher confidence first
  }
  // 2. Greater number of component-level evidence references
  if (a.evidence.length !== b.evidence.length) {
    return b.evidence.length - a.evidence.length; // more evidence first
  }
  // 3. Greater number of populated identity hints
  const hintsA = countPopulatedIdentityHints(a);
  const hintsB = countPopulatedIdentityHints(b);
  if (hintsA !== hintsB) {
    return hintsB - hintsA; // more hints first
  }
  // 4. Stable canonical payload string comparison
  const sigA = canonicalPayloadSignature(a);
  const sigB = canonicalPayloadSignature(b);
  return sigA.localeCompare(sigB); // alphabetical signature first
}

export class SystemPopulationPlanner {
  public static normalizeComponentKey(rawKey: string): string {
    return rawKey
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "_");
  }

  public plan(seed: SystemDiscoverySeed, options?: PlannerOptions): PopulationWorkItem[] {
    // 1. Validate maxWorkItemsBound explicitly
    const rawBound = options?.maxWorkItemsBound ?? DISCOVERY_COLLECTION_BOUNDS.MAX_POPULATION_WORK_ITEMS;
    if (
      typeof rawBound !== "number" ||
      !Number.isFinite(rawBound) ||
      !Number.isInteger(rawBound) ||
      rawBound < 1 ||
      rawBound > DISCOVERY_COLLECTION_BOUNDS.MAX_POPULATION_WORK_ITEMS
    ) {
      throw new Error(
        `Invalid maxWorkItemsBound: ${String(rawBound)}. Must be a finite integer between 1 and ${DISCOVERY_COLLECTION_BOUNDS.MAX_POPULATION_WORK_ITEMS}.`
      );
    }
    const maxBound = rawBound;

    // 2. Group components by normalized component key
    const componentGroups = new Map<string, SystemComponent[]>();

    for (const comp of seed.components) {
      const normKey = SystemPopulationPlanner.normalizeComponentKey(comp.key);
      const existing = componentGroups.get(normKey);
      if (existing) {
        existing.push(comp);
      } else {
        componentGroups.set(normKey, [comp]);
      }
    }

    // 3. Select deterministic winner for each component group using tie-breaking precedence
    const uniqueComponents: SystemComponent[] = [];
    const sortedGroupKeys = Array.from(componentGroups.keys()).sort();

    for (const normKey of sortedGroupKeys) {
      const candidates = componentGroups.get(normKey)!;
      // Sort candidates deterministically according to precedence rules
      const sortedCandidates = [...candidates].sort(compareComponentCandidates);
      uniqueComponents.push(sortedCandidates[0]);
    }

    // 4. Check maximum bound - FAIL EXPLICITLY if unique work items exceed bound
    if (uniqueComponents.length > maxBound) {
      throw new Error(
        `Maximum population work items bound exceeded: ${uniqueComponents.length} work items exceeds maximum allowed bound of ${maxBound}`
      );
    }

    // 5. Build work items
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
      });
    });

    // 6. Ensure deterministic output order regardless of input component order!
    workItems.sort((a, b) => a.normalizedComponentKey.localeCompare(b.normalizedComponentKey));

    return workItems;
  }
}
