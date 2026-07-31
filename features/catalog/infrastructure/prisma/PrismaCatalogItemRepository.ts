import type { PrismaClient } from '../../../../lib/generated/prisma/client';
import { UniqueEntityID } from '../../../../lib/core';
import {
  CatalogItem,
  type CatalogItemType,
} from '../../domain/entities';
import type {
  CatalogItemListFilters,
  CatalogItemRepository,
} from '../../domain/repositories';

type DecimalLike = {
  toNumber(): number;
};

type CatalogItemRecord = {
  id: string;
  companyId: string;
  categoryId: string | null;
  unitId: string | null;
  taxRateId: string | null;
  type: string;
  code: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  purchasePrice: DecimalLike | null;
  salePrice: DecimalLike;
  trackInventory: boolean;
  allowDiscount: boolean;
  imageUrl: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaCatalogItemRepository
  implements CatalogItemRepository
{
  constructor(
    private readonly prisma: PrismaClient,
  ) {}

  public async findById(
    id: string,
  ): Promise<CatalogItem | null> {
    const record = await this.prisma.catalogItem.findUnique({
      where: {
        id,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findByIdAndCompanyId(
    id: string,
    companyId: string,
  ): Promise<CatalogItem | null> {
    const record = await this.prisma.catalogItem.findFirst({
      where: {
        id,
        companyId,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findByCode(
    companyId: string,
    code: string,
  ): Promise<CatalogItem | null> {
    const record = await this.prisma.catalogItem.findUnique({
      where: {
        companyId_code: {
          companyId,
          code: code.trim().toUpperCase(),
        },
      },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findBySku(
    companyId: string,
    sku: string,
  ): Promise<CatalogItem | null> {
    const normalizedSku = sku.trim();

    if (!normalizedSku) {
      return null;
    }

    const record = await this.prisma.catalogItem.findFirst({
      where: {
        companyId,
        sku: normalizedSku,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findByBarcode(
    companyId: string,
    barcode: string,
  ): Promise<CatalogItem | null> {
    const normalizedBarcode = barcode.trim();

    if (!normalizedBarcode) {
      return null;
    }

    const record = await this.prisma.catalogItem.findFirst({
      where: {
        companyId,
        barcode: normalizedBarcode,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findAll(
    filters: CatalogItemListFilters,
  ): Promise<CatalogItem[]> {
    const search = filters.search?.trim();

    const records = await this.prisma.catalogItem.findMany({
      where: {
        companyId: filters.companyId,
        type: filters.type,
        categoryId: filters.categoryId,
        isActive: filters.isActive,
        ...(search
          ? {
              OR: [
                {
                  code: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  sku: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  barcode: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  description: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          name: 'asc',
        },
      ],
      skip: filters.skip,
      take: filters.take,
    });

    return records.map((record) =>
      this.toDomain(record),
    );
  }

  public async count(
    filters: CatalogItemListFilters,
  ): Promise<number> {
    const search = filters.search?.trim();

    return this.prisma.catalogItem.count({
      where: {
        companyId: filters.companyId,
        type: filters.type,
        categoryId: filters.categoryId,
        isActive: filters.isActive,
        ...(search
          ? {
              OR: [
                {
                  code: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  sku: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  barcode: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  description: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
    });
  }

  public async save(
    item: CatalogItem,
  ): Promise<CatalogItem> {
    const data = {
      companyId: item.companyId,
      categoryId: item.categoryId,
      unitId: item.unitId,
      taxRateId: item.taxRateId,
      type: item.type,
      code: item.code,
      sku: item.sku,
      barcode: item.barcode,
      name: item.name,
      description: item.description,
      purchasePrice: item.purchasePrice,
      salePrice: item.salePrice,
      trackInventory: item.trackInventory,
      allowDiscount: item.allowDiscount,
      imageUrl: item.imageUrl,
      notes: item.notes,
      isActive: item.isActive,
      updatedAt: item.updatedAt,
    };

    const record = await this.prisma.catalogItem.upsert({
      where: {
        id: item.id.toString(),
      },
      create: {
        id: item.id.toString(),
        ...data,
        createdAt: item.createdAt,
      },
      update: data,
    });

    return this.toDomain(record);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.catalogItem.delete({
      where: {
        id,
      },
    });
  }

  public async deleteByIdAndCompanyId(
    id: string,
    companyId: string,
  ): Promise<void> {
    await this.prisma.catalogItem.deleteMany({
      where: {
        id,
        companyId,
      },
    });
  }

  private toDomain(
    record: CatalogItemRecord,
  ): CatalogItem {
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
        description: record.description,
        purchasePrice:
          record.purchasePrice?.toNumber() ?? null,
        salePrice: record.salePrice.toNumber(),
        trackInventory: record.trackInventory,
        allowDiscount: record.allowDiscount,
        imageUrl: record.imageUrl,
        notes: record.notes,
        isActive: record.isActive,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      new UniqueEntityID(record.id),
    );
  }
}