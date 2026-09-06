import { DiscoveryEvidence, DiscoveryEvidenceInput } from "./DiscoveryEvidence";
import {
  MarketRelevanceTarget,
  CANONICAL_SCOPE_GLOBAL,
  DISCOVERY_COLLECTION_BOUNDS,
  validateMarketRelevanceTargets,
  validateStringCollection,
} from "./MarketRelevanceTarget";
import { SystemComponent, SystemComponentInput } from "./SystemComponent";

export type DiscoverySeedType = "SYSTEM" | "SOLUTION";

export interface SystemDiscoverySeedInput {
  id: string;
  seedType: DiscoverySeedType;
  nameEn: string;
  nameAr?: string | null;
  aliasesEn?: string[] | null;
  aliasesAr?: string[] | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  domainHint?: string | null;
  categoryHint?: string | null;
  evidence: DiscoveryEvidence[] | DiscoveryEvidenceInput[];
  confidence: number;
  discoveredAt?: Date | null;
  components?: SystemComponent[] | SystemComponentInput[] | null;
  marketRelevanceTargets?: MarketRelevanceTarget[] | null;
}

export class SystemDiscoverySeed {
  public readonly id: string;
  public readonly seedType: DiscoverySeedType;
  public readonly nameEn: string;
  public readonly nameAr: string | null;
  public readonly aliasesEn: string[];
  public readonly aliasesAr: string[];
  public readonly descriptionEn: string | null;
  public readonly descriptionAr: string | null;
  public readonly domainHint: string | null;
  public readonly categoryHint: string | null;
  public readonly evidence: DiscoveryEvidence[];
  public readonly confidence: number;
  public readonly discoveredAt: Date;
  public readonly components: SystemComponent[];
  public readonly canonicalScope: typeof CANONICAL_SCOPE_GLOBAL = CANONICAL_SCOPE_GLOBAL;
  public readonly marketRelevanceTargets: MarketRelevanceTarget[];

  constructor(input: SystemDiscoverySeedInput) {
    if (!input || typeof input !== "object") {
      throw new Error("SystemDiscoverySeed input must be a valid object");
    }
    if (!input.id || typeof input.id !== "string" || !input.id.trim()) {
      throw new Error("SystemDiscoverySeed id cannot be empty");
    }
    if (input.seedType !== "SYSTEM" && input.seedType !== "SOLUTION") {
      throw new Error(`Invalid seedType: ${String(input.seedType)}`);
    }
    if (!input.nameEn || typeof input.nameEn !== "string" || !input.nameEn.trim()) {
      throw new Error("SystemDiscoverySeed nameEn cannot be empty");
    }
    if (!Array.isArray(input.evidence)) {
      throw new Error("SystemDiscoverySeed evidence must be an array");
    }
    if (input.evidence.length > DISCOVERY_COLLECTION_BOUNDS.MAX_EVIDENCE) {
      throw new Error(
        `Seed evidence collection bound exceeded (${input.evidence.length} > ${DISCOVERY_COLLECTION_BOUNDS.MAX_EVIDENCE})`
      );
    }
    if (
      typeof input.confidence !== "number" ||
      !Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1
    ) {
      throw new Error(
        `SystemDiscoverySeed confidence must be a finite number between 0 and 1. Got: ${input.confidence}`
      );
    }

    this.id = input.id.trim();
    this.seedType = input.seedType;
    this.nameEn = input.nameEn.trim();
    this.nameAr = typeof input.nameAr === "string" && input.nameAr.trim() ? input.nameAr.trim() : null;

    this.aliasesEn = validateStringCollection(
      input.aliasesEn,
      "AliasesEn",
      DISCOVERY_COLLECTION_BOUNDS.MAX_ALIASES
    );

    this.aliasesAr = validateStringCollection(
      input.aliasesAr,
      "AliasesAr",
      DISCOVERY_COLLECTION_BOUNDS.MAX_ALIASES
    );

    this.descriptionEn =
      typeof input.descriptionEn === "string" && input.descriptionEn.trim() ? input.descriptionEn.trim() : null;
    this.descriptionAr =
      typeof input.descriptionAr === "string" && input.descriptionAr.trim() ? input.descriptionAr.trim() : null;
    this.domainHint = typeof input.domainHint === "string" && input.domainHint.trim() ? input.domainHint.trim() : null;
    this.categoryHint =
      typeof input.categoryHint === "string" && input.categoryHint.trim() ? input.categoryHint.trim() : null;

    this.evidence = input.evidence.map((e) => {
      if (e instanceof DiscoveryEvidence) return e;
      if (!e || typeof e !== "object") throw new Error("Seed evidence contains malformed item");
      return new DiscoveryEvidence(e);
    });

    this.confidence = input.confidence;
    this.discoveredAt = input.discoveredAt instanceof Date ? input.discoveredAt : new Date();

    const rawComponents = input.components;
    if (rawComponents !== undefined && rawComponents !== null) {
      if (!Array.isArray(rawComponents)) {
        throw new Error("Components must be an array");
      }
      if (rawComponents.length > DISCOVERY_COLLECTION_BOUNDS.MAX_COMPONENTS_PER_SEED) {
        throw new Error(
          `Components collection bound exceeded (${rawComponents.length} > ${DISCOVERY_COLLECTION_BOUNDS.MAX_COMPONENTS_PER_SEED})`
        );
      }
      this.components = rawComponents.map((c) => {
        if (c instanceof SystemComponent) return c;
        if (!c || typeof c !== "object") throw new Error("Components array contains malformed item");
        return new SystemComponent(c);
      });
    } else {
      this.components = [];
    }

    this.marketRelevanceTargets = validateMarketRelevanceTargets(input.marketRelevanceTargets);
  }

  public get requiresArabicLocalization(): boolean {
    if (!this.nameAr || this.nameAr.trim() === "") {
      return true;
    }
    if (this.descriptionEn && (!this.descriptionAr || this.descriptionAr.trim() === "")) {
      return true;
    }
    if (this.components.some((c) => c.requiresArabicLocalization)) {
      return true;
    }
    return false;
  }
}
