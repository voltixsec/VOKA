import {
  ComponentIdentityHints,
  ComponentType,
  DiscoveryEvidence,
  MarketRelevanceTarget,
  CANONICAL_SCOPE_GLOBAL,
} from "../../domain/discovery";

export type WorkItemIntention = "GLOBAL_PRODUCT_EXPANSION" | "SERVICE_POPULATION";

export interface PopulationWorkItemInput {
  id: string;
  seedId: string;
  seedType: "SYSTEM" | "SOLUTION";
  intention: WorkItemIntention;
  componentKey: string;
  normalizedComponentKey: string;
  componentType: ComponentType;
  nameEn: string;
  nameAr?: string | null;
  purpose?: string | null;
  categoryHint?: string | null;
  identityHints?: ComponentIdentityHints | null;
  specificationHints?: string[];
  dependencyHints?: string[];
  componentEvidence: DiscoveryEvidence[];
  seedEvidence: DiscoveryEvidence[];
  evidenceDiscoveryRequired: boolean;
  confidence: number;
  marketRelevanceTargets: MarketRelevanceTarget[];
  requiresArabicLocalization: boolean;
  createdAt?: Date;
}

export class PopulationWorkItem {
  public readonly id: string;
  public readonly seedId: string;
  public readonly seedType: "SYSTEM" | "SOLUTION";
  public readonly intention: WorkItemIntention;
  public readonly componentKey: string;
  public readonly normalizedComponentKey: string;
  public readonly componentType: ComponentType;
  public readonly nameEn: string;
  public readonly nameAr: string | null;
  public readonly purpose: string | null;
  public readonly categoryHint: string | null;
  public readonly identityHints: ComponentIdentityHints | null;
  public readonly specificationHints: string[];
  public readonly dependencyHints: string[];
  public readonly componentEvidence: DiscoveryEvidence[];
  public readonly seedEvidence: DiscoveryEvidence[];
  public readonly evidenceDiscoveryRequired: boolean;
  public readonly confidence: number;
  public readonly canonicalScope: typeof CANONICAL_SCOPE_GLOBAL = CANONICAL_SCOPE_GLOBAL;
  public readonly marketRelevanceTargets: MarketRelevanceTarget[];
  public readonly requiresArabicLocalization: boolean;
  public readonly createdAt: Date;

  constructor(input: PopulationWorkItemInput) {
    this.id = input.id;
    this.seedId = input.seedId;
    this.seedType = input.seedType;
    this.intention = input.intention;
    this.componentKey = input.componentKey;
    this.normalizedComponentKey = input.normalizedComponentKey;
    this.componentType = input.componentType;
    this.nameEn = input.nameEn;
    this.nameAr = input.nameAr ?? null;
    this.purpose = input.purpose ?? null;
    this.categoryHint = input.categoryHint ?? null;

    // IDENTITY HINTS PRESERVED EXACTLY BYTE-FOR-BYTE!
    this.identityHints = input.identityHints ? { ...input.identityHints } : null;

    this.specificationHints = [...(input.specificationHints || [])];
    this.dependencyHints = [...(input.dependencyHints || [])];
    this.componentEvidence = [...input.componentEvidence];
    this.seedEvidence = [...input.seedEvidence];
    this.evidenceDiscoveryRequired = input.evidenceDiscoveryRequired;
    this.confidence = input.confidence;
    this.marketRelevanceTargets = [...input.marketRelevanceTargets];
    this.requiresArabicLocalization = input.requiresArabicLocalization;
    this.createdAt = input.createdAt || new Date();
  }
}
