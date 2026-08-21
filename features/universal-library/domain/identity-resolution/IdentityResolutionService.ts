import { NormalizedIngestionPayload } from "../normalization/NormalizationPipelineService";

export interface IdentityResolutionContext {
  // Database lookup functions provided by repository/service
  findItemByGlobalIdentifier?: (identifierType: string, normalizedValue: string) => Promise<{ id: string } | null>;
  findItemByManufacturerMpn?: (manufacturerId: string | null, manufacturerName: string | null, mpnValue: string) => Promise<{ id: string } | null>;
  findItemByManufacturerModel?: (manufacturerId: string | null, manufacturerName: string | null, modelNumber: string) => Promise<{ id: string } | null>;
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
    if (context.findItemBySourceExternalRef) {
      const existing = await context.findItemBySourceExternalRef(sourceId, sourceExternalId);
      if (existing) {
        return {
          matchedItemId: existing.id,
          confidenceReason: "EXISTING_SOURCE_EXTERNAL_REF",
          status: "MATCHED",
        };
      }
    }

    // Rule 2: Exact Trusted Global Commercial Identifiers (GTIN/EAN/UPC)
    if (context.findItemByGlobalIdentifier) {
      const globalIdentifiers = normalized.identifiers.filter(i => GLOBAL_IDENTIFIER_TYPES.has(i.identifierType));
      for (const ident of globalIdentifiers) {
        const item = await context.findItemByGlobalIdentifier(ident.identifierType, ident.normalizedValue);
        if (item) {
          return {
            matchedItemId: item.id,
            confidenceReason: "EXACT_GLOBAL_IDENTIFIER",
            status: "MATCHED",
          };
        }
      }
    }

    // Rule 3: Manufacturer + MPN
    if (context.findItemByManufacturerMpn && (normalized.manufacturerName || normalized.manufacturerCode)) {
      const mpnIdentifiers = normalized.identifiers.filter(i => i.identifierType === "MPN");
      for (const ident of mpnIdentifiers) {
        const item = await context.findItemByManufacturerMpn(
          null,
          normalized.manufacturerName || normalized.manufacturerCode,
          ident.normalizedValue
        );
        if (item) {
          return {
            matchedItemId: item.id,
            confidenceReason: "EXACT_MANUFACTURER_MPN",
            status: "MATCHED",
          };
        }
      }
    }

    // Rule 4: Manufacturer/Brand + Model Number
    if (context.findItemByManufacturerModel && normalized.normalizedModelNumber && (normalized.manufacturerName || normalized.brandName)) {
      const item = await context.findItemByManufacturerModel(
        null,
        normalized.manufacturerName || normalized.brandName,
        normalized.normalizedModelNumber
      );
      if (item) {
        return {
          matchedItemId: item.id,
          confidenceReason: "EXACT_MANUFACTURER_MODEL",
          status: "MATCHED",
        };
      }
    }

    // Rule 5: Conservative normalized identity rules
    if (context.findItemsByConservativeName) {
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
}
