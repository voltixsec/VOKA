import { DiscoveryEvidence, DiscoveryEvidenceInput } from "./DiscoveryEvidence";
import { DISCOVERY_COLLECTION_BOUNDS, validateStringCollection } from "./MarketRelevanceTarget";

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
    if (!input || typeof input !== "object") {
      throw new Error("SystemComponent input must be a valid object");
    }
    if (!input.key || typeof input.key !== "string" || !input.key.trim()) {
      throw new Error("SystemComponent key cannot be empty");
    }
    if (!input.nameEn || typeof input.nameEn !== "string" || !input.nameEn.trim()) {
      throw new Error("SystemComponent nameEn cannot be empty");
    }
    if (input.componentType !== "PRODUCT" && input.componentType !== "SERVICE") {
      throw new Error(`Invalid componentType: ${String(input.componentType)}`);
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
    this.nameAr = typeof input.nameAr === "string" && input.nameAr.trim() ? input.nameAr.trim() : null;
    this.purpose = typeof input.purpose === "string" && input.purpose.trim() ? input.purpose.trim() : null;
    this.categoryHint = typeof input.categoryHint === "string" && input.categoryHint.trim() ? input.categoryHint.trim() : null;

    this.specificationHints = validateStringCollection(
      input.specificationHints,
      "Specification hints",
      DISCOVERY_COLLECTION_BOUNDS.MAX_SPECIFICATION_HINTS
    );

    this.dependencyHints = validateStringCollection(
      input.dependencyHints,
      "Dependency hints",
      DISCOVERY_COLLECTION_BOUNDS.MAX_DEPENDENCY_HINTS
    );

    const rawEvidence = input.evidence;
    if (rawEvidence !== undefined && rawEvidence !== null) {
      if (!Array.isArray(rawEvidence)) {
        throw new Error("Component evidence must be an array");
      }
      if (rawEvidence.length > DISCOVERY_COLLECTION_BOUNDS.MAX_EVIDENCE) {
        throw new Error(
          `Component evidence collection bound exceeded (${rawEvidence.length} > ${DISCOVERY_COLLECTION_BOUNDS.MAX_EVIDENCE})`
        );
      }
      this.evidence = rawEvidence.map((e) => {
        if (e instanceof DiscoveryEvidence) return e;
        if (!e || typeof e !== "object") throw new Error("Component evidence contains malformed item");
        return new DiscoveryEvidence(e);
      });
    } else {
      this.evidence = [];
    }

    this.confidence = input.confidence;

    // IDENTITY HINTS MUST BE PRESERVED BYTE-FOR-BYTE!
    // Do NOT alter, uppercase, lowercase, or trim identity hints.
    if (input.identityHints && typeof input.identityHints === "object") {
      const h = input.identityHints;
      this.identityHints = {
        manufacturerHint: typeof h.manufacturerHint === "string" ? h.manufacturerHint : null,
        brandHint: typeof h.brandHint === "string" ? h.brandHint : null,
        familyHint: typeof h.familyHint === "string" ? h.familyHint : null,
        modelNumber: typeof h.modelNumber === "string" ? h.modelNumber : null,
        mpn: typeof h.mpn === "string" ? h.mpn : null,
        sku: typeof h.sku === "string" ? h.sku : null,
        gtin: typeof h.gtin === "string" ? h.gtin : null,
      };
    } else {
      this.identityHints = null;
    }
  }

  public get requiresArabicLocalization(): boolean {
    return !this.nameAr || this.nameAr.trim() === "";
  }
}
