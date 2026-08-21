import type { PrismaClient } from "../../../../lib/generated/prisma/client";
import { CatalogItem, CatalogItemType } from "../../../catalog";
import { UniqueEntityID } from "../../../../lib/core";
import {
  AdoptUniversalItemParams,
  AdoptUniversalItemResult,
  GetCategoriesParams,
  IUniversalLibraryRepository,
  LookupIdentifierParams,
  MAX_UNIVERSAL_SEARCH_LIMIT,
  SearchBrandsParams,
  SearchManufacturersParams,
  SearchUniversalLibraryParams,
  SearchUniversalLibraryResult,
  UniversalCatalogItem,
  UniversalCategory,
  UniversalItemAdoption,
  UniversalItemProvenance,
  UniversalSource,
  UniversalManufacturer,
  UniversalBrand,
  UniversalProductFamily,
  UniversalItemAlias,
  UniversalItemIdentifier,
  UniversalAttributeDefinition,
  UniversalItemAttributeValue,
  VerificationStatus,
  normalizeUniversalIdentifier,
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
      ...(params.manufacturerId ? { manufacturerId: params.manufacturerId } : {}),
      ...(params.brandId ? { brandId: params.brandId } : {}),
      ...(params.familyId ? { familyId: params.familyId } : {}),
      ...(params.modelNumber
        ? { modelNumber: { contains: params.modelNumber.trim(), mode: "insensitive" } }
        : {}),
      ...(params.identifierType && params.identifierValue
        ? {
            identifiers: {
              some: {
                identifierType: params.identifierType,
                ...normalizeUniversalIdentifier(
                  params.identifierType,
                  params.identifierValue,
                  {
                    manufacturerId: params.identifierManufacturerId,
                    source: params.identifierSource,
                  }
                ),
              },
            },
          }
        : {}),
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
              { modelNumber: { contains: search, mode: "insensitive" } },
              { variantName: { contains: search, mode: "insensitive" } },
              {
                aliases: {
                  some: {
                    alias: { contains: search, mode: "insensitive" },
                  },
                },
              },
              {
                identifiers: {
                  some: {
                    normalizedValue: { contains: search.toUpperCase(), mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const total = await this.prisma.universalCatalogItem.count({
      where: whereClause,
    });

    const cursor = params.cursor ? this.decodeCursor(params.cursor) : undefined;
    const records = await this.prisma.universalCatalogItem.findMany({
      where: whereClause,
      include: {
        category: true,
        manufacturer: true,
        brand: {
          include: {
            manufacturer: true,
          },
        },
        family: {
          include: {
            brand: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit + 1,
      ...(cursor
        ? {
            where: {
              AND: [
                whereClause,
                {
                  OR: [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                  ],
                },
              ],
            },
          }
        : {}),
    });

    let nextCursor: string | undefined = undefined;
    if (records.length > limit) {
      records.pop();
      const lastItem = records[records.length - 1];
      nextCursor = lastItem
        ? this.encodeCursor(lastItem.createdAt, lastItem.id)
        : undefined;
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
        manufacturer: true,
        brand: {
          include: {
            manufacturer: true,
          },
        },
        family: {
          include: {
            brand: true,
          },
        },
        parent: true,
        variants: true,
        aliases: true,
        identifiers: true,
        attributeValues: {
          include: {
            attributeDefinition: true,
          },
        },
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
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: Math.max(1, Math.min(params.limit ?? 50, 100)),
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

  public async searchManufacturers(
    params: SearchManufacturersParams = {}
  ): Promise<UniversalManufacturer[]> {
    const search = params.query?.trim();
    const limit = Math.max(1, Math.min(params.limit ?? 20, MAX_UNIVERSAL_SEARCH_LIMIT));

    const whereClause: any = {
      ...(params.isActive === undefined ? { isActive: true } : { isActive: params.isActive }),
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

    const records = await this.prisma.universalManufacturer.findMany({
      where: whereClause,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit,
    });

    return records.map((r) => this.mapManufacturerToDomain(r));
  }

  public async getManufacturerById(id: string): Promise<UniversalManufacturer | null> {
    const record = await this.prisma.universalManufacturer.findUnique({
      where: { id },
    });

    return record ? this.mapManufacturerToDomain(record) : null;
  }

  public async searchBrands(params: SearchBrandsParams = {}): Promise<UniversalBrand[]> {
    const search = params.query?.trim();
    const limit = Math.max(1, Math.min(params.limit ?? 20, MAX_UNIVERSAL_SEARCH_LIMIT));

    const whereClause: any = {
      ...(params.isActive === undefined ? { isActive: true } : { isActive: params.isActive }),
      ...(params.manufacturerId ? { manufacturerId: params.manufacturerId } : {}),
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

    const records = await this.prisma.universalBrand.findMany({
      where: whereClause,
      include: {
        manufacturer: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit,
    });

    return records.map((r) => this.mapBrandToDomain(r));
  }

  public async getBrandById(id: string): Promise<UniversalBrand | null> {
    const record = await this.prisma.universalBrand.findUnique({
      where: { id },
      include: {
        manufacturer: true,
      },
    });

    return record ? this.mapBrandToDomain(record) : null;
  }

  public async lookupByIdentifier(
    params: LookupIdentifierParams
  ): Promise<UniversalCatalogItem | null> {
    const normalized = normalizeUniversalIdentifier(
      params.identifierType,
      params.value,
      { manufacturerId: params.manufacturerId, source: params.source }
    );

    const identifierRecords = await this.prisma.universalItemIdentifier.findMany({
      where: {
        identifierType: params.identifierType,
        normalizedValue: normalized.normalizedValue,
        ...(normalized.manufacturerId ? { manufacturerId: normalized.manufacturerId } : {}),
        ...(normalized.source ? { source: normalized.source } : {}),
        universalItem: { isActive: true },
      },
      include: {
        universalItem: {
          include: {
            category: true,
            manufacturer: true,
            brand: {
              include: {
                manufacturer: true,
              },
            },
            family: {
              include: {
                brand: true,
              },
            },
            parent: true,
            aliases: true,
            identifiers: true,
            attributeValues: {
              include: {
                attributeDefinition: true,
              },
            },
            provenances: {
              include: {
                source: true,
              },
            },
          },
        },
      },
      take: 2,
    });

    if (identifierRecords.length > 1) {
      throw new AmbiguousUniversalIdentifierError();
    }
    const identifierRecord = identifierRecords[0];
    if (!identifierRecord?.universalItem) {
      return null;
    }

    return this.mapItemToDomain(identifierRecord.universalItem);
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

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const adoption = await tx.universalItemAdoption.findUnique({
          where: {
            companyId_universalItemId: {
              companyId: params.companyId,
              universalItemId: params.universalItemId,
            },
          },
          include: { catalogItem: true },
        });
        if (adoption?.catalogItem) return { existing: adoption };

        const universalItem = await tx.universalCatalogItem.findFirst({
          where: { id: params.universalItemId, isActive: true },
        });
        if (!universalItem) throw new UniversalAdoptionError("UNIVERSAL_ITEM_NOT_ADOPTABLE");

        if (params.unitId) {
          const unit = await tx.unit.findFirst({
            where: {
              id: params.unitId,
              OR: [{ companyId: params.companyId }, { companyId: null }],
            },
            select: { id: true },
          });
          if (!unit) throw new UniversalAdoptionError("UNIT_NOT_FOUND");
        }

        if (params.taxRateId) {
          const taxRate = await tx.taxRate.findFirst({
            where: {
              id: params.taxRateId,
              OR: [
                { companyId: params.companyId },
                { companyId: null, isSystem: true },
              ],
            },
            select: { id: true },
          });
          if (!taxRate) throw new UniversalAdoptionError("TAX_RATE_NOT_FOUND");
        }

        const code =
          params.code?.trim().toUpperCase() || `UCL-${universalItem.id.toUpperCase()}`;
        const salePrice = params.salePrice ?? 0;
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

      if ("existing" in result && result.existing) {
        return {
          catalogItem: this.mapCatalogItemToDomain(result.existing.catalogItem),
          adoption: this.mapAdoptionToDomain(result.existing),
          isNewAdoption: false,
        };
      }

      return {
        catalogItem: this.mapCatalogItemToDomain(result.catalogItem),
        adoption: this.mapAdoptionToDomain(result.adoption),
        isNewAdoption: true,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const winner = await this.prisma.universalItemAdoption.findUnique({
          where: {
            companyId_universalItemId: {
              companyId: params.companyId,
              universalItemId: params.universalItemId,
            },
          },
          include: { catalogItem: true },
        });
        if (winner?.catalogItem) {
          return {
            catalogItem: this.mapCatalogItemToDomain(winner.catalogItem),
            adoption: this.mapAdoptionToDomain(winner),
            isNewAdoption: false,
          };
        }
        throw new UniversalAdoptionError("CATALOG_CODE_CONFLICT");
      }
      throw error;
    }
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), "utf8")
      .toString("base64url");
  }

  private decodeCursor(value: string): { createdAt: Date; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      const createdAt = new Date(parsed.createdAt);
      if (
        !parsed ||
        typeof parsed.id !== "string" ||
        !parsed.id ||
        Number.isNaN(createdAt.getTime())
      ) {
        throw new Error("invalid");
      }
      return { createdAt, id: parsed.id };
    } catch {
      throw new InvalidUniversalCursorError();
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
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
      manufacturerId: record.manufacturerId,
      brandId: record.brandId,
      familyId: record.familyId,
      modelNumber: record.modelNumber,
      variantName: record.variantName,
      parentId: record.parentId,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      category: record.category ? this.mapCategoryToDomain(record.category) : null,
      manufacturer: record.manufacturer ? this.mapManufacturerToDomain(record.manufacturer) : null,
      brand: record.brand ? this.mapBrandToDomain(record.brand) : null,
      family: record.family ? this.mapFamilyToDomain(record.family) : null,
      parent: record.parent ? this.mapItemToDomain(record.parent) : null,
      variants: record.variants ? record.variants.map((v: any) => this.mapItemToDomain(v)) : [],
      provenances: record.provenances
        ? record.provenances.map((p: any) => this.mapProvenanceToDomain(p))
        : [],
      aliases: record.aliases ? record.aliases.map((a: any) => this.mapAliasToDomain(a)) : [],
      identifiers: record.identifiers
        ? record.identifiers.map((i: any) => this.mapIdentifierToDomain(i))
        : [],
      attributeValues: record.attributeValues
        ? record.attributeValues.map((v: any) => this.mapAttributeValueToDomain(v))
        : [],
    });
  }

  private mapManufacturerToDomain(record: any): UniversalManufacturer {
    return new UniversalManufacturer({
      id: record.id,
      code: record.code,
      name: record.name,
      nameAr: record.nameAr,
      nameEn: record.nameEn,
      countryCode: record.countryCode,
      websiteUrl: record.websiteUrl,
      description: record.description,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private mapBrandToDomain(record: any): UniversalBrand {
    return new UniversalBrand({
      id: record.id,
      manufacturerId: record.manufacturerId,
      code: record.code,
      name: record.name,
      nameAr: record.nameAr,
      nameEn: record.nameEn,
      logoUrl: record.logoUrl,
      description: record.description,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      manufacturer: record.manufacturer ? this.mapManufacturerToDomain(record.manufacturer) : null,
    });
  }

  private mapFamilyToDomain(record: any): UniversalProductFamily {
    return new UniversalProductFamily({
      id: record.id,
      brandId: record.brandId,
      code: record.code,
      name: record.name,
      nameAr: record.nameAr,
      nameEn: record.nameEn,
      description: record.description,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      brand: record.brand ? this.mapBrandToDomain(record.brand) : null,
    });
  }

  private mapAliasToDomain(record: any): UniversalItemAlias {
    return new UniversalItemAlias({
      id: record.id,
      universalItemId: record.universalItemId,
      alias: record.alias,
      locale: record.locale,
      aliasType: record.aliasType,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private mapIdentifierToDomain(record: any): UniversalItemIdentifier {
    return new UniversalItemIdentifier({
      id: record.id,
      universalItemId: record.universalItemId,
      identifierType: record.identifierType,
      value: record.value,
      normalizedValue: record.normalizedValue,
      manufacturerId: record.manufacturerId,
      source: record.source,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private mapAttributeValueToDomain(record: any): UniversalItemAttributeValue {
    return new UniversalItemAttributeValue({
      id: record.id,
      universalItemId: record.universalItemId,
      attributeDefinitionId: record.attributeDefinitionId,
      valueString: record.valueString,
      valueNumber: record.valueNumber,
      valueBoolean: record.valueBoolean,
      valueJson: record.valueJson,
      unit: record.unit,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      attributeDefinition: record.attributeDefinition
        ? this.mapAttributeDefinitionToDomain(record.attributeDefinition)
        : null,
    });
  }

  private mapAttributeDefinitionToDomain(record: any): UniversalAttributeDefinition {
    return new UniversalAttributeDefinition({
      id: record.id,
      categoryId: record.categoryId,
      code: record.code,
      name: record.name,
      nameAr: record.nameAr,
      nameEn: record.nameEn,
      dataType: record.dataType,
      unitOfMeasure: record.unitOfMeasure,
      description: record.description,
      isRequired: record.isRequired,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
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
        purchasePrice: record.purchasePrice?.toNumber() ?? null,
        salePrice: record.salePrice.toNumber(),
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

export class InvalidUniversalCursorError extends Error {
  constructor() {
    super("Universal Library cursor is invalid.");
  }
}

export class AmbiguousUniversalIdentifierError extends Error {
  constructor() {
    super("Universal identifier resolved ambiguously.");
  }
}

export class UniversalAdoptionError extends Error {
  constructor(
    public readonly code:
      | "UNIVERSAL_ITEM_NOT_ADOPTABLE"
      | "UNIT_NOT_FOUND"
      | "TAX_RATE_NOT_FOUND"
      | "CATALOG_CODE_CONFLICT"
  ) {
    super(code);
  }
}
