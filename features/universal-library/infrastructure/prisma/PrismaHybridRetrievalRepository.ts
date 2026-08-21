import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { CatalogItemType } from "../../../catalog";
import {
  CommercialCandidate,
  CandidateIdentifier,
  CandidateUnit,
} from "../../domain/retrieval";
import {
  FetchCatalogCandidatesParams,
  FetchUniversalCandidatesParams,
  IHybridRetrievalRepository,
  UniversalAdoptionLink,
} from "../../domain/repositories/HybridRetrievalRepository";

export class PrismaHybridRetrievalRepository implements IHybridRetrievalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async fetchCatalogCandidates(
    params: FetchCatalogCandidatesParams
  ): Promise<CommercialCandidate[]> {
    const search = params.query?.trim();

    const records = await this.prisma.catalogItem.findMany({
      where: {
        companyId: params.companyId,
        ...(params.type ? { type: params.type } : {}),
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
        ...(params.isActive === undefined ? { isActive: true } : { isActive: params.isActive }),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { nameAr: { contains: search, mode: "insensitive" } },
                { nameEn: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { barcode: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { descriptionAr: { contains: search, mode: "insensitive" } },
                { descriptionEn: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        unit: true,
        category: true,
      },
      take: params.limit,
      orderBy: [{ createdAt: "desc" }],
    });

    return records.map((r) => this.mapCatalogItemToCandidate(r));
  }

  public async fetchUniversalCandidates(
    params: FetchUniversalCandidatesParams
  ): Promise<CommercialCandidate[]> {
    const search = params.query?.trim();

    const records = await this.prisma.universalCatalogItem.findMany({
      where: {
        ...(params.type ? { type: params.type } : {}),
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
        ...(params.manufacturerId ? { manufacturerId: params.manufacturerId } : {}),
        ...(params.brandId ? { brandId: params.brandId } : {}),
        ...(params.isActive === undefined ? { isActive: true } : { isActive: params.isActive }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { nameAr: { contains: search, mode: "insensitive" } },
                { nameEn: { contains: search, mode: "insensitive" } },
                { searchName: { contains: search, mode: "insensitive" } },
                { modelNumber: { contains: search, mode: "insensitive" } },
                { variantName: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { descriptionAr: { contains: search, mode: "insensitive" } },
                { descriptionEn: { contains: search, mode: "insensitive" } },
                {
                  aliases: {
                    some: { alias: { contains: search, mode: "insensitive" } },
                  },
                },
                {
                  identifiers: {
                    some: { value: { contains: search, mode: "insensitive" } },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        manufacturer: true,
        brand: true,
        category: true,
        identifiers: true,
        aliases: true,
      },
      take: params.limit,
      orderBy: [{ createdAt: "desc" }],
    });

    return records.map((r) => this.mapUniversalItemToCandidate(r));
  }

  public async fetchAdoptions(
    companyId: string,
    universalItemIds: string[],
    catalogItemIds: string[]
  ): Promise<UniversalAdoptionLink[]> {
    if (universalItemIds.length === 0 && catalogItemIds.length === 0) {
      return [];
    }

    const records = await this.prisma.universalItemAdoption.findMany({
      where: {
        companyId,
        OR: [
          ...(universalItemIds.length > 0 ? [{ universalItemId: { in: universalItemIds } }] : []),
          ...(catalogItemIds.length > 0 ? [{ catalogItemId: { in: catalogItemIds } }] : []),
        ],
      },
    });

    return records.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      universalItemId: r.universalItemId,
      catalogItemId: r.catalogItemId,
    }));
  }

  public async fetchCatalogCandidatesByIds(
    companyId: string,
    catalogItemIds: string[]
  ): Promise<CommercialCandidate[]> {
    if (catalogItemIds.length === 0) return [];

    const records = await this.prisma.catalogItem.findMany({
      where: {
        companyId,
        id: { in: catalogItemIds },
      },
      include: {
        unit: true,
        category: true,
      },
    });

    return records.map((r) => this.mapCatalogItemToCandidate(r));
  }

  private mapCatalogItemToCandidate(record: any): CommercialCandidate {
    const identifiers: CandidateIdentifier[] = [];
    if (record.sku) {
      identifiers.push({ type: "SKU", value: record.sku });
    }
    if (record.barcode) {
      identifiers.push({ type: "BARCODE", value: record.barcode });
    }

    const unit: CandidateUnit | null = record.unit
      ? { id: record.unit.id, name: record.unit.name, symbol: record.unit.symbol }
      : null;

    return {
      id: `company-catalog:${record.id}`,
      origin: "COMPANY_CATALOG",
      type: record.type as CatalogItemType,
      displayName: record.name,
      nameAr: record.nameAr,
      nameEn: record.nameEn,
      code: record.code,
      sku: record.sku,
      barcode: record.barcode,
      modelNumber: null,
      identifiers,
      aliases: [],
      manufacturerName: null,
      brandName: null,
      categoryId: record.categoryId,
      categoryName: record.category?.name ?? null,
      isActive: Boolean(record.isActive),
      isAdopted: false,
      linkedCatalogItemId: record.id,
      linkedUniversalItemId: null,
      salePrice: record.salePrice != null ? Number(record.salePrice) : null,
      unit,
      description: record.description,
      descriptionAr: record.descriptionAr,
      descriptionEn: record.descriptionEn,
      score: 0,
      matchReasons: [],
    };
  }

  private mapUniversalItemToCandidate(record: any): CommercialCandidate {
    const identifiers: CandidateIdentifier[] = (record.identifiers || []).map((i: any) => ({
      type: i.identifierType,
      value: i.value,
    }));

    const aliases: string[] = (record.aliases || []).map((a: any) => a.alias);

    return {
      id: `universal-library:${record.id}`,
      origin: "UNIVERSAL_LIBRARY",
      type: record.type as CatalogItemType,
      displayName: record.name,
      nameAr: record.nameAr,
      nameEn: record.nameEn,
      code: null,
      sku: null,
      barcode: null,
      modelNumber: record.modelNumber ?? null,
      identifiers,
      aliases,
      manufacturerName: record.manufacturer?.name ?? null,
      brandName: record.brand?.name ?? null,
      categoryId: record.categoryId,
      categoryName: record.category?.name ?? null,
      isActive: Boolean(record.isActive),
      isAdopted: false,
      linkedCatalogItemId: null,
      linkedUniversalItemId: record.id,
      salePrice: null,
      unit: null,
      description: record.description,
      descriptionAr: record.descriptionAr,
      descriptionEn: record.descriptionEn,
      score: 0,
      matchReasons: [],
    };
  }
}
