import type { CatalogItemType } from "../../../catalog";
import type { CommercialCandidate } from "../retrieval";

export interface FetchCatalogCandidatesParams {
  companyId: string;
  query?: string;
  type?: CatalogItemType;
  categoryId?: string;
  isActive?: boolean;
  limit: number;
}

export interface FetchUniversalCandidatesParams {
  query?: string;
  type?: CatalogItemType;
  categoryId?: string;
  manufacturerId?: string;
  brandId?: string;
  isActive?: boolean;
  limit: number;
}

export interface FetchSemanticCandidatesParams {
  queryEmbedding: number[];
  type?: CatalogItemType;
  categoryId?: string;
  manufacturerId?: string;
  brandId?: string;
  isActive?: boolean;
  limit: number;
}

export interface UniversalAdoptionLink {
  id: string;
  companyId: string;
  universalItemId: string;
  catalogItemId: string;
}

export interface IHybridRetrievalRepository {
  fetchCatalogCandidates(params: FetchCatalogCandidatesParams): Promise<CommercialCandidate[]>;
  fetchUniversalCandidates(params: FetchUniversalCandidatesParams): Promise<CommercialCandidate[]>;
  fetchSemanticCandidates?(params: FetchSemanticCandidatesParams): Promise<CommercialCandidate[]>;
  fetchAdoptions(companyId: string, universalItemIds: string[], catalogItemIds: string[]): Promise<UniversalAdoptionLink[]>;
  fetchCatalogCandidatesByIds(companyId: string, catalogItemIds: string[]): Promise<CommercialCandidate[]>;
}
