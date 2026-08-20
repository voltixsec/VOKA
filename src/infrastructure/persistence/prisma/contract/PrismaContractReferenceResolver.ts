import { prisma } from "../../../../../lib/prisma";
import type { QuotationLineType } from "../../../../domain/quotation";
import type {
  ContractCatalogItemSnapshot,
  IContractReferenceResolver,
} from "../../../../application/contract/repositories/IContractReferenceResolver";

export class PrismaContractReferenceResolver
implements IContractReferenceResolver {
  constructor(private readonly db = prisma) {}

  async isPriceListAvailable(input: {
    companyId: string;
    priceListId: string;
    currencyCode: string;
  }): Promise<boolean> {
    const priceList = await this.db.priceList.findFirst({
      where: {
        id: input.priceListId,
        companyId: input.companyId,
        currencyCode: input.currencyCode,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    return Boolean(priceList);
  }

  async getCatalogItemSnapshot(
    companyId: string,
    catalogItemId: string,
  ): Promise<ContractCatalogItemSnapshot | null> {
    const item = await this.db.catalogItem.findFirst({
      where: {
        id: catalogItemId,
        companyId,
        isActive: true,
      },
      select: {
        id: true,
        type: true,
        code: true,
        name: true,
        nameAr: true,
        nameEn: true,
        description: true,
        descriptionAr: true,
        descriptionEn: true,
        taxRateId: true,
        unit: {
          select: {
            companyId: true,
            name: true,
            nameAr: true,
            nameEn: true,
            isActive: true,
          },
        },
      },
    });

    if (!item) return null;

    if (
      item.unit &&
      (
        !item.unit.isActive ||
        (
          item.unit.companyId !== null &&
          item.unit.companyId !== companyId
        )
      )
    ) {
      return null;
    }

    return {
      id: item.id,
      type: item.type as QuotationLineType,
      itemCode: item.code,
      itemName: item.name,
      itemNameAr: item.nameAr,
      itemNameEn: item.nameEn,
      description: item.description,
      descriptionAr: item.descriptionAr,
      descriptionEn: item.descriptionEn,
      unitName: item.unit?.name ?? null,
      unitNameAr: item.unit?.nameAr ?? null,
      unitNameEn: item.unit?.nameEn ?? null,
      defaultTaxRateId: item.taxRateId,
    };
  }

  async resolveTaxRatePercentage(
    companyId: string,
    taxRateId: string,
  ): Promise<number | null> {
    const taxRate = await this.db.taxRate.findFirst({
      where: {
        id: taxRateId,
        isActive: true,
        OR: [
          {
            companyId,
          },
          {
            companyId: null,
            isSystem: true,
          },
        ],
      },
      select: {
        percentage: true,
      },
    });

    if (!taxRate) return null;

    return Number(taxRate.percentage);
  }
}
