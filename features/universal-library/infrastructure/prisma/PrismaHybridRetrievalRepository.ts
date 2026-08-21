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
    const baseWhere: any = {
      companyId: params.companyId,
      ...(params.type ? { type: params.type } : {}),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.isActive === undefined ? { isActive: true } : { isActive: params.isActive }),
    };
    const include = { unit: true, category: true } as const;

    const records = await this.prisma.catalogItem.findMany({
      where: {
        ...baseWhere,
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
      include,
      take: params.limit,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });

    const exactRecords = search ? await this.prisma.catalogItem.findMany({
      where: {
        ...baseWhere,
        OR: [
          { code: { equals: search, mode: "insensitive" } },
          { sku: { equals: search, mode: "insensitive" } },
          { barcode: { equals: search, mode: "insensitive" } },
        ],
      },
      include,
      take: Math.min(params.limit, 10),
      orderBy: { id: "asc" },
    }) : [];

    return this.mergeBounded(exactRecords, records, params.limit).map((r) => this.mapCatalogItemToCandidate(r));
  }

  public async fetchUniversalCandidates(
    params: FetchUniversalCandidatesParams
  ): Promise<CommercialCandidate[]> {
    const search = params.query?.trim();
    const baseWhere: any = {
      ...(params.type ? { type: params.type } : {}),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.manufacturerId ? { manufacturerId: params.manufacturerId } : {}),
      ...(params.brandId ? { brandId: params.brandId } : {}),
      ...(params.isActive === undefined ? { isActive: true } : { isActive: params.isActive }),
    };
    const include = {
      manufacturer: true,
      brand: true,
      category: true,
      identifiers: { orderBy: { id: "asc" as const }, take: 20 },
      aliases: { orderBy: { id: "asc" as const }, take: 20 },
    };

    const records = await this.prisma.universalCatalogItem.findMany({
      where: {
        ...baseWhere,
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
      include,
      take: params.limit,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });

    const normalizedQueries = search ? [...new Set([
      search,
      search.replace(/[\s-]+/g, ""),
      search.replace(/\s+/g, " ").toUpperCase(),
    ])] : [];
    const exactRecords = search ? await this.prisma.universalCatalogItem.findMany({
      where: {
        ...baseWhere,
        OR: [
          { name: { equals: search, mode: "insensitive" } },
          { nameAr: { equals: search, mode: "insensitive" } },
          { nameEn: { equals: search, mode: "insensitive" } },
          { modelNumber: { equals: search, mode: "insensitive" } },
          { aliases: { some: { alias: { equals: search, mode: "insensitive" } } } },
          { identifiers: { some: { normalizedValue: { in: normalizedQueries } } } },
        ],
      },
      include,
      take: Math.min(params.limit, 20),
      orderBy: { id: "asc" },
    }) : [];

    return this.mergeBounded(exactRecords, records, params.limit).map((r) => this.mapUniversalItemToCandidate(r));
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
      select: { id: true, companyId: true, universalItemId: true, catalogItemId: true },
      orderBy: { id: "asc" },
      take: 200,
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
        id: { in: [...new Set(catalogItemIds)].slice(0, 100) },
      },
      include: {
        unit: true,
        category: true,
      },
      orderBy: { id: "asc" },
    });

    return records.map((r) => this.mapCatalogItemToCandidate(r));
  }

  private mapCatalogItemToCandidate(record: any): CommercialCandidate {
    const identifiers: CandidateIdentifier[] = [];
    if (record.sku) {
      identifiers.push({ type: "SKU", value: record.sku, normalizedValue: record.sku.trim().toLowerCase() });
    }
    if (record.barcode) {
      identifiers.push({ type: "BARCODE", value: record.barcode, normalizedValue: record.barcode.trim().toLowerCase() });
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
      manufacturerId: null,
      brandName: null,
      brandId: null,
      categoryId: record.categoryId,
      categoryName: record.category?.name ?? null,
      isActive: Boolean(record.isActive),
      isAdopted: false,
      linkedCatalogItemId: record.id,
      linkedUniversalItemId: null,
      salePrice: record.salePrice != null
        ? (typeof record.salePrice.toNumber === "function" ? record.salePrice.toNumber() : Number(record.salePrice))
        : null,
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
      normalizedValue: i.normalizedValue,
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
      manufacturerId: record.manufacturerId ?? null,
      brandName: record.brand?.name ?? null,
      brandId: record.brandId ?? null,
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

  private mergeBounded<T extends { id: string }>(preferred: T[], fallback: T[], limit: number): T[] {
    const merged = new Map<string, T>();
    for (const record of [...preferred, ...fallback]) {
      if (!merged.has(record.id)) merged.set(record.id, record);
      if (merged.size >= limit) break;
    }
    return [...merged.values()];
  }
}
