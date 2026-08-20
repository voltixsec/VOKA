import type { PrismaClient } from "../../../../lib/generated/prisma/client";
import { CatalogItem, CatalogItemType } from "../../../catalog";
import { UniqueEntityID } from "../../../../lib/core";
import {
  AdoptUniversalItemParams,
  AdoptUniversalItemResult,
  GetCategoriesParams,
  IUniversalLibraryRepository,
  MAX_UNIVERSAL_SEARCH_LIMIT,
  SearchUniversalLibraryParams,
  SearchUniversalLibraryResult,
  UniversalCatalogItem,
  UniversalCategory,
  UniversalItemAdoption,
  UniversalItemProvenance,
  UniversalSource,
  VerificationStatus,
} from "../../domain";

export class PrismaUniversalLibraryRepository implements IUniversalLibraryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async searchItems(
    params: SearchUniversalLibraryParams
  ): Promise<SearchUniversalLibraryResult> {
    const rawLimit = params.limit ?? 20;
    const limit = Math.max(1, Math.min(rawLimit, MAX_UNIVERSAL_SEARCH_LIMIT));
    const search = params.query?.trim();

    const whereClause: any = {
      ...(params.isActive === undefined ? { isActive: true } : { isActive: params.isActive }),
      ...(params.type ? { type: params.type } : {}),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { nameAr: { contains: search, mode: "insensitive" } },
              { nameEn: { contains: search, mode: "insensitive" } },
              { searchName: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { descriptionAr: { contains: search, mode: "insensitive" } },
              { descriptionEn: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const total = await this.prisma.universalCatalogItem.count({
      where: whereClause,
    });

    const records = await this.prisma.universalCatalogItem.findMany({
      where: whereClause,
      include: {
        category: true,
        provenances: {
          include: {
            source: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit + 1,
      ...(params.cursor
        ? {
            cursor: { id: params.cursor },
            skip: 1,
          }
        : {}),
    });

    let nextCursor: string | undefined = undefined;
    if (records.length > limit) {
      const nextItem = records.pop();
      nextCursor = nextItem?.id;
    }

    const items = records.map((r) => this.mapItemToDomain(r));

    return {
      items,
      total,
      nextCursor,
    };
  }

  public async getItemById(id: string): Promise<UniversalCatalogItem | null> {
    const record = await this.prisma.universalCatalogItem.findUnique({
      where: { id },
      include: {
        category: true,
        provenances: {
          include: {
            source: true,
          },
        },
      },
    });

    return record ? this.mapItemToDomain(record) : null;
  }

  public async getCategories(params: GetCategoriesParams = {}): Promise<UniversalCategory[]> {
    const search = params.search?.trim();
    const whereClause: any = {
      ...(params.isActive === undefined ? { isActive: true } : { isActive: params.isActive }),
      ...(params.parentId !== undefined ? { parentId: params.parentId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { nameAr: { contains: search, mode: "insensitive" } },
              { nameEn: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const records = await this.prisma.universalCategory.findMany({
      where: whereClause,
      include: {
        parent: true,
        children: true,
      },
      orderBy: [{ name: "asc" }],
    });

    return records.map((r) => this.mapCategoryToDomain(r));
  }

  public async getCategoryById(id: string): Promise<UniversalCategory | null> {
    const record = await this.prisma.universalCategory.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });

    return record ? this.mapCategoryToDomain(record) : null;
  }

  public async findAdoption(
    companyId: string,
    universalItemId: string
  ): Promise<UniversalItemAdoption | null> {
    const record = await this.prisma.universalItemAdoption.findUnique({
      where: {
        companyId_universalItemId: {
          companyId,
          universalItemId,
        },
      },
      include: {
        catalogItem: true,
      },
    });

    return record ? this.mapAdoptionToDomain(record) : null;
  }

  public async adoptItem(
    params: AdoptUniversalItemParams
  ): Promise<AdoptUniversalItemResult> {
    // 1. Check if adoption already exists
    const existingAdoption = await this.prisma.universalItemAdoption.findUnique({
      where: {
        companyId_universalItemId: {
          companyId: params.companyId,
          universalItemId: params.universalItemId,
        },
      },
      include: {
        catalogItem: true,
      },
    });

    if (existingAdoption && existingAdoption.catalogItem) {
      return {
        catalogItem: this.mapCatalogItemToDomain(existingAdoption.catalogItem),
        adoption: this.mapAdoptionToDomain(existingAdoption),
        isNewAdoption: false,
      };
    }

    // 2. Fetch universal item
    const universalItem = await this.prisma.universalCatalogItem.findUnique({
      where: { id: params.universalItemId },
    });

    if (!universalItem) {
      throw new Error(`Universal item '${params.universalItemId}' not found.`);
    }

    // 3. Adopt in transaction
    const baseCode = params.code?.trim() || `UCL-${universalItem.id.substring(0, 8).toUpperCase()}`;
    let code = baseCode;

    // Code deduplication per tenant
    const existingCode = await this.prisma.catalogItem.findUnique({
      where: {
        companyId_code: {
          companyId: params.companyId,
          code,
        },
      },
    });

    if (existingCode) {
      code = `${baseCode}-${Date.now().toString(36).toUpperCase()}`;
    }

    const salePrice = params.salePrice ?? 0;

    const result = await this.prisma.$transaction(async (tx) => {
      const createdCatalogItem = await tx.catalogItem.create({
        data: {
          companyId: params.companyId,
          type: universalItem.type,
          code,
          name: universalItem.name,
          nameAr: universalItem.nameAr,
          nameEn: universalItem.nameEn,
          description: universalItem.description,
          descriptionAr: universalItem.descriptionAr,
          descriptionEn: universalItem.descriptionEn,
          salePrice,
          unitId: params.unitId ?? null,
          taxRateId: params.taxRateId ?? null,
          isActive: true,
        },
      });

      const createdAdoption = await tx.universalItemAdoption.create({
        data: {
          companyId: params.companyId,
          universalItemId: universalItem.id,
          catalogItemId: createdCatalogItem.id,
          adoptedByUserId: params.adoptedByUserId ?? null,
        },
        include: {
          catalogItem: true,
        },
      });

      return {
        catalogItem: createdCatalogItem,
        adoption: createdAdoption,
      };
    });

    return {
      catalogItem: this.mapCatalogItemToDomain(result.catalogItem),
      adoption: this.mapAdoptionToDomain(result.adoption),
      isNewAdoption: true,
    };
  }

  private mapItemToDomain(record: any): UniversalCatalogItem {
    return new UniversalCatalogItem({
      id: record.id,
      type: record.type as CatalogItemType,
      name: record.name,
      nameAr: record.nameAr,
      nameEn: record.nameEn,
      searchName: record.searchName,
      description: record.description,
      descriptionAr: record.descriptionAr,
      descriptionEn: record.descriptionEn,
      categoryId: record.categoryId,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      category: record.category ? this.mapCategoryToDomain(record.category) : null,
      provenances: record.provenances
        ? record.provenances.map((p: any) => this.mapProvenanceToDomain(p))
        : [],
    });
  }

  private mapCategoryToDomain(record: any): UniversalCategory {
    return new UniversalCategory({
      id: record.id,
      parentId: record.parentId,
      code: record.code,
      name: record.name,
      nameAr: record.nameAr,
      nameEn: record.nameEn,
      description: record.description,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      parent: record.parent ? this.mapCategoryToDomain(record.parent) : null,
      children: record.children
        ? record.children.map((c: any) => this.mapCategoryToDomain(c))
        : [],
    });
  }

  private mapProvenanceToDomain(record: any): UniversalItemProvenance {
    return new UniversalItemProvenance({
      id: record.id,
      universalItemId: record.universalItemId,
      sourceId: record.sourceId,
      externalRef: record.externalRef,
      confidence: record.confidence ? record.confidence.toNumber() : null,
      observedAt: record.observedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      source: record.source
        ? new UniversalSource({
            id: record.source.id,
            name: record.source.name,
            type: record.source.type,
            externalRef: record.source.externalRef,
            url: record.source.url,
            licenseInfo: record.source.licenseInfo,
            verificationStatus: record.source.verificationStatus as VerificationStatus,
            createdAt: record.source.createdAt,
            updatedAt: record.source.updatedAt,
          })
        : null,
    });
  }

  private mapAdoptionToDomain(record: any): UniversalItemAdoption {
    return new UniversalItemAdoption({
      id: record.id,
      companyId: record.companyId,
      universalItemId: record.universalItemId,
      catalogItemId: record.catalogItemId,
      adoptedByUserId: record.adoptedByUserId,
      adoptedAt: record.adoptedAt,
      catalogItem: record.catalogItem ? this.mapCatalogItemToDomain(record.catalogItem) : null,
    });
  }

  private mapCatalogItemToDomain(record: any): CatalogItem {
    return CatalogItem.restore(
      {
        companyId: record.companyId,
        categoryId: record.categoryId,
        unitId: record.unitId,
        taxRateId: record.taxRateId,
        type: record.type as CatalogItemType,
        code: record.code,
        sku: record.sku,
        barcode: record.barcode,
        name: record.name,
        nameAr: record.nameAr,
        nameEn: record.nameEn,
        description: record.description,
        descriptionAr: record.descriptionAr,
        descriptionEn: record.descriptionEn,
        purchasePrice: record.purchasePrice ? record.purchasePrice.toNumber() : null,
        salePrice: record.salePrice ? record.salePrice.toNumber() : 0,
        trackInventory: record.trackInventory,
        allowDiscount: record.allowDiscount,
        imageUrl: record.imageUrl,
        notes: record.notes,
        isActive: record.isActive,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      new UniqueEntityID(record.id)
    );
  }
}
