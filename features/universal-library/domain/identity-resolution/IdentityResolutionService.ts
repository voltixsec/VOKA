import { NormalizedIngestionPayload } from "../normalization/NormalizationPipelineService";

export interface IdentityResolutionContext {
  findItemsByGlobalIdentifier?: (identifierType: string, normalizedValue: string) => Promise<Array<{ id: string }>>;
  findItemsByManufacturerMpn?: (manufacturerName: string, mpnValue: string) => Promise<Array<{ id: string }>>;
  findItemsByManufacturerModel?: (manufacturerName: string, modelNumber: string) => Promise<Array<{ id: string }>>;
  findItemBySourceExternalRef?: (sourceId: string, sourceExternalId: string) => Promise<{ id: string } | null>;
  findItemsByConservativeName?: (normalizedName: string, manufacturerName: string | null) => Promise<Array<{ id: string }>>;
}

export type MatchConfidenceReason =
  | "EXACT_GLOBAL_IDENTIFIER"
  | "EXACT_MANUFACTURER_MPN"
  | "EXACT_MANUFACTURER_MODEL"
  | "EXISTING_SOURCE_EXTERNAL_REF"
  | "CONSERVATIVE_NAME_MATCH"
  | "AMBIGUOUS_MULTIPLE_MATCHES"
  | "NO_MATCH";

export interface IdentityResolutionResult {
  matchedItemId: string | null;
  confidenceReason: MatchConfidenceReason;
  status: "MATCHED" | "NEEDS_REVIEW" | "NORMALIZED";
}

const GLOBAL_IDENTIFIER_TYPES = new Set([
  "GTIN", "GTIN_8", "GTIN_12", "GTIN_13", "GTIN_14", "EAN", "UPC"
]);

export class IdentityResolutionService {
  public static async resolveIdentity(
    normalized: NormalizedIngestionPayload,
    sourceId: string,
    sourceExternalId: string,
    context: IdentityResolutionContext
  ): Promise<IdentityResolutionResult> {
    // Rule 1: Existing source external reference mapping
    const sourceCandidate = context.findItemBySourceExternalRef
      ? await context.findItemBySourceExternalRef(sourceId, sourceExternalId)
      : null;

    // Rule 2: Exact Trusted Global Commercial Identifiers (GTIN/EAN/UPC)
    if (context.findItemsByGlobalIdentifier) {
      const globalIdentifiers = normalized.identifiers.filter(i => GLOBAL_IDENTIFIER_TYPES.has(i.identifierType));
      const candidateIds = new Set<string>();
      for (const ident of globalIdentifiers) {
        const items = await context.findItemsByGlobalIdentifier(ident.identifierType, ident.normalizedValue);
        items.forEach((item) => candidateIds.add(item.id));
      }
      if (candidateIds.size > 1) return this.ambiguous();
      if (candidateIds.size === 1) {
        const id = [...candidateIds][0];
        if (sourceCandidate && sourceCandidate.id !== id) return this.ambiguous();
        return { matchedItemId: id, confidenceReason: sourceCandidate ? "EXISTING_SOURCE_EXTERNAL_REF" : "EXACT_GLOBAL_IDENTIFIER", status: "MATCHED" };
      }
    }

    // Rule 3: Manufacturer + MPN
    if (context.findItemsByManufacturerMpn && (normalized.manufacturerName || normalized.manufacturerCode)) {
      const mpnIdentifiers = normalized.identifiers.filter(i => i.identifierType === "MPN");
      const candidateIds = new Set<string>();
      for (const ident of mpnIdentifiers) {
        const items = await context.findItemsByManufacturerMpn(normalized.manufacturerName || normalized.manufacturerCode!, ident.normalizedValue);
        items.forEach((item) => candidateIds.add(item.id));
      }
      if (candidateIds.size > 1) return this.ambiguous();
      if (candidateIds.size === 1) {
        const id = [...candidateIds][0];
        if (sourceCandidate && sourceCandidate.id !== id) return this.ambiguous();
        return { matchedItemId: id, confidenceReason: sourceCandidate ? "EXISTING_SOURCE_EXTERNAL_REF" : "EXACT_MANUFACTURER_MPN", status: "MATCHED" };
      }
    }

    // Rule 4: Manufacturer/Brand + Model Number
    if (context.findItemsByManufacturerModel && normalized.normalizedModelNumber && normalized.manufacturerName) {
      const items = await context.findItemsByManufacturerModel(normalized.manufacturerName, normalized.normalizedModelNumber);
      if (items.length > 1) return this.ambiguous();
      if (items.length === 1) {
        if (sourceCandidate && sourceCandidate.id !== items[0].id) return this.ambiguous();
        return { matchedItemId: items[0].id, confidenceReason: sourceCandidate ? "EXISTING_SOURCE_EXTERNAL_REF" : "EXACT_MANUFACTURER_MODEL", status: "MATCHED" };
      }
    }

    if (sourceCandidate) {
      return { matchedItemId: sourceCandidate.id, confidenceReason: "EXISTING_SOURCE_EXTERNAL_REF", status: "MATCHED" };
    }

    // Rule 5: Conservative normalized identity rules
    if (context.findItemsByConservativeName && normalized.manufacturerName) {
      const candidates = await context.findItemsByConservativeName(
        normalized.name.toLowerCase(),
        normalized.manufacturerName
      );

      if (candidates.length === 1) {
        return {
          matchedItemId: candidates[0].id,
          confidenceReason: "CONSERVATIVE_NAME_MATCH",
          status: "MATCHED",
        };
      } else if (candidates.length > 1) {
        // Ambiguous match -> NEEDS_REVIEW, do NOT auto-merge!
        return {
          matchedItemId: null,
          confidenceReason: "AMBIGUOUS_MULTIPLE_MATCHES",
          status: "NEEDS_REVIEW",
        };
      }
    }

    return {
      matchedItemId: null,
      confidenceReason: "NO_MATCH",
      status: "NORMALIZED",
    };
  }

  private static ambiguous(): IdentityResolutionResult {
    return { matchedItemId: null, confidenceReason: "AMBIGUOUS_MULTIPLE_MATCHES", status: "NEEDS_REVIEW" };
  }
}
