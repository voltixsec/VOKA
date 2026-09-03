import { DiscoveryEvidence, DiscoveryEvidenceInput } from "./DiscoveryEvidence";
import { DISCOVERY_COLLECTION_BOUNDS } from "./MarketRelevanceTarget";

export type ComponentType = "PRODUCT" | "SERVICE";

export interface ComponentIdentityHints {
  manufacturerHint?: string | null;
  brandHint?: string | null;
  familyHint?: string | null;
  modelNumber?: string | null;
  mpn?: string | null;
  sku?: string | null;
  gtin?: string | null;
}

export interface SystemComponentInput {
  key: string;
  componentType: ComponentType;
  nameEn: string;
  nameAr?: string | null;
  purpose?: string | null;
  categoryHint?: string | null;
  specificationHints?: string[] | null;
  dependencyHints?: string[] | null;
  evidence?: DiscoveryEvidence[] | DiscoveryEvidenceInput[] | null;
  confidence: number;
  identityHints?: ComponentIdentityHints | null;
}

export class SystemComponent {
  public readonly key: string;
  public readonly componentType: ComponentType;
  public readonly nameEn: string;
  public readonly nameAr: string | null;
  public readonly purpose: string | null;
  public readonly categoryHint: string | null;
  public readonly specificationHints: string[];
  public readonly dependencyHints: string[];
  public readonly evidence: DiscoveryEvidence[];
  public readonly confidence: number;
  public readonly identityHints: ComponentIdentityHints | null;

  constructor(input: SystemComponentInput) {
    if (!input || !input.key || typeof input.key !== "string" || !input.key.trim()) {
      throw new Error("SystemComponent key cannot be empty");
    }
    if (!input.nameEn || typeof input.nameEn !== "string" || !input.nameEn.trim()) {
      throw new Error("SystemComponent nameEn cannot be empty");
    }
    if (input.componentType !== "PRODUCT" && input.componentType !== "SERVICE") {
      throw new Error(`Invalid componentType: ${input.componentType}`);
    }
    if (
      typeof input.confidence !== "number" ||
      !Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1
    ) {
      throw new Error(`SystemComponent confidence must be a finite number between 0 and 1. Got: ${input.confidence}`);
    }

    this.key = input.key.trim();
    this.componentType = input.componentType;
    this.nameEn = input.nameEn.trim();
    this.nameAr = input.nameAr && input.nameAr.trim() ? input.nameAr.trim() : null;
    this.purpose = input.purpose && input.purpose.trim() ? input.purpose.trim() : null;
    this.categoryHint = input.categoryHint && input.categoryHint.trim() ? input.categoryHint.trim() : null;

    const specHints = Array.isArray(input.specificationHints) ? input.specificationHints : [];
    if (specHints.length > DISCOVERY_COLLECTION_BOUNDS.MAX_SPECIFICATION_HINTS) {
      throw new Error(
        `Specification hints collection bound exceeded (${specHints.length} > ${DISCOVERY_COLLECTION_BOUNDS.MAX_SPECIFICATION_HINTS})`
      );
    }
    this.specificationHints = [...specHints];

    const depHints = Array.isArray(input.dependencyHints) ? input.dependencyHints : [];
    if (depHints.length > DISCOVERY_COLLECTION_BOUNDS.MAX_DEPENDENCY_HINTS) {
      throw new Error(
        `Dependency hints collection bound exceeded (${depHints.length} > ${DISCOVERY_COLLECTION_BOUNDS.MAX_DEPENDENCY_HINTS})`
      );
    }
    this.dependencyHints = [...depHints];

    const rawEvidence = Array.isArray(input.evidence) ? input.evidence : [];
    if (rawEvidence.length > DISCOVERY_COLLECTION_BOUNDS.MAX_EVIDENCE) {
      throw new Error(
        `Component evidence collection bound exceeded (${rawEvidence.length} > ${DISCOVERY_COLLECTION_BOUNDS.MAX_EVIDENCE})`
      );
    }
    this.evidence = rawEvidence.map((e) => (e instanceof DiscoveryEvidence ? e : new DiscoveryEvidence(e)));

    this.confidence = input.confidence;

    // IDENTITY HINTS MUST BE PRESERVED BYTE-FOR-BYTE!
    // Do NOT alter, uppercase, lowercase, or trim identity hints.
    if (input.identityHints) {
      this.identityHints = {
        manufacturerHint: input.identityHints.manufacturerHint ?? null,
        brandHint: input.identityHints.brandHint ?? null,
        familyHint: input.identityHints.familyHint ?? null,
        modelNumber: input.identityHints.modelNumber ?? null,
        mpn: input.identityHints.mpn ?? null,
        sku: input.identityHints.sku ?? null,
        gtin: input.identityHints.gtin ?? null,
      };
    } else {
      this.identityHints = null;
    }
  }

  public get requiresArabicLocalization(): boolean {
    return !this.nameAr || this.nameAr.trim() === "";
  }
}
