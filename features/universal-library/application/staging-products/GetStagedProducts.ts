export type StagedProductEntityType =
  | "PRODUCT_MODEL"
  | "ITEM"
  | "SERVICE";

export interface StagedProductSummary {
  id: string;
  externalKey: string;
  entityType: StagedProductEntityType;
  status: string;
  name: string | null;
  description: string | null;
  modelNumber: string | null;
  manufacturer: string | null;
  brand: string | null;
  family: string | null;
  system: string | null;
  lifecycle: string | null;

  matchedItemId: string | null;
  normalizedData: Record<string, unknown> | null;

  sourceId: string;
  sourceName: string;
  sourceType: string;
  sourceVerificationStatus: string;
  sourceTrustScore: number | null;
  sourceUrl: string | null;
  sourceLicenseReferenceUrl: string | null;

  canonicalSourceUrl: string | null;
  fetchedAt: string | null;
  attributionText: string | null;

  rawPayload: Record<string, unknown>;
}

export interface StagedProductsQuery {
  search?: string;
  entityType?: StagedProductEntityType;
  manufacturer?: string;
  brand?: string;
  family?: string;
  system?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export interface StagedProductsGlobalTotals {
  totalStagedCommercialRecords: number;
  totalProductModels: number;
  totalItems: number;
  totalServices: number;
}

export interface StagedProductsResult {
  items: StagedProductSummary[];
  total: number;
  nextCursor: string | null;
  globalTotals: StagedProductsGlobalTotals;
}

export interface IStagedProductsRepository {
  list(
    query: Required<
      Pick<StagedProductsQuery, "limit">
    > &
      Omit<StagedProductsQuery, "limit">,
  ): Promise<StagedProductsResult>;
}

export class GetStagedProducts {
  public constructor(
    private readonly repository: IStagedProductsRepository,
  ) {}

  public async execute(
    input: StagedProductsQuery = {},
  ): Promise<StagedProductsResult> {
    const limit = input.limit ?? 50;

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new Error("INVALID_STAGED_PRODUCTS_LIMIT");
    }

    return this.repository.list({
      ...input,
      limit,
    });
  }
}
