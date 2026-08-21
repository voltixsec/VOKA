import type { CatalogItemType } from "../../../catalog";

export type CandidateOrigin = "COMPANY_CATALOG" | "UNIVERSAL_LIBRARY";

export type MatchReason =
  | "EXACT_IDENTIFIER"
  | "EXACT_CODE"
  | "EXACT_MODEL"
  | "EXACT_NAME"
  | "ALIAS_MATCH"
  | "COMPANY_CATALOG_PRIORITY"
  | "CATEGORY_MATCH"
  | "PARTIAL_NAME_MATCH"
  | "TYPE_MATCH";

export interface CandidateIdentifier {
  type: string;
  value: string;
}

export interface CandidateUnit {
  id: string | null;
  name: string | null;
  symbol: string | null;
}

export interface CommercialCandidate {
  id: string;
  origin: CandidateOrigin;
  type: CatalogItemType;
  displayName: string;
  nameAr?: string | null;
  nameEn?: string | null;
  code?: string | null;
  modelNumber?: string | null;
  sku?: string | null;
  barcode?: string | null;
  identifiers: CandidateIdentifier[];
  aliases?: string[];
  manufacturerName?: string | null;
  brandName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  isActive: boolean;
  isAdopted: boolean;
  linkedCatalogItemId?: string | null;
  linkedUniversalItemId?: string | null;
  salePrice?: number | null;
  unit?: CandidateUnit | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  score: number;
  matchReasons: MatchReason[];
}

export interface AICandidateProjection {
  candidateId: string;
  origin: CandidateOrigin;
  type: CatalogItemType;
  displayName: string;
  nameAr: string | null;
  nameEn: string | null;
  code: string | null;
  modelNumber: string | null;
  manufacturer: string | null;
  brand: string | null;
  category: string | null;
  salePrice: number | null;
  unitSymbol: string | null;
  isAdopted: boolean;
  linkedCatalogItemId: string | null;
  linkedUniversalItemId: string | null;
}

export function toAICandidateProjection(
  candidate: CommercialCandidate
): AICandidateProjection {
  return {
    candidateId: candidate.id,
    origin: candidate.origin,
    type: candidate.type,
    displayName: candidate.displayName,
    nameAr: candidate.nameAr ?? null,
    nameEn: candidate.nameEn ?? null,
    code: candidate.code ?? null,
    modelNumber: candidate.modelNumber ?? null,
    manufacturer: candidate.manufacturerName ?? null,
    brand: candidate.brandName ?? null,
    category: candidate.categoryName ?? null,
    salePrice: candidate.salePrice ?? null,
    unitSymbol: candidate.unit?.symbol ?? null,
    isAdopted: candidate.isAdopted,
    linkedCatalogItemId: candidate.linkedCatalogItemId ?? null,
    linkedUniversalItemId: candidate.linkedUniversalItemId ?? null,
  };
}
