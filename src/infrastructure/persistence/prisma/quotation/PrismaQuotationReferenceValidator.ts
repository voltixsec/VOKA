import { prisma } from "../../../../../lib/prisma";

import type {
  IQuotationReferenceValidator,
  InvalidQuotationReference,
  QuotationReferenceValidationInput,
} from "../../../../application/quotation/repositories/IQuotationReferenceValidator";

export class PrismaQuotationReferenceValidator
implements IQuotationReferenceValidator {
  constructor(
    private readonly db = prisma,
  ) {}

  async findInvalidReference(
    input: QuotationReferenceValidationInput,
  ): Promise<InvalidQuotationReference | null> {
    const customer = await this.db.customer.findFirst({
      where: {
        id: input.customerId,
        companyId: input.companyId,
        isDeleted: false,
      },
      select: {
        id: true,
      },
    });

    if (!customer) {
      return {
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer was not found for the active company.",
      };
    }

    if (input.priceListId) {
      const priceList = await this.db.priceList.findFirst({
        where: {
          id: input.priceListId,
          companyId: input.companyId,
        },
        select: {
          id: true,
        },
      });

      if (!priceList) {
        return {
          code: "PRICE_LIST_NOT_FOUND",
          message: "Price list was not found for the active company.",
        };
      }
    }

    const catalogItemIds = [
      ...new Set(input.catalogItemIds),
    ];

    if (catalogItemIds.length > 0) {
      const catalogItemCount =
        await this.db.catalogItem.count({
          where: {
            id: {
              in: catalogItemIds,
            },
            companyId: input.companyId,
          },
        });

      if (catalogItemCount !== catalogItemIds.length) {
        return {
          code: "CATALOG_ITEM_NOT_FOUND",
          message: "A catalog item was not found for the active company.",
        };
      }
    }

    const taxRateIds = [
      ...new Set(input.taxRateIds),
    ];

    if (taxRateIds.length > 0) {
      const taxRateCount = await this.db.taxRate.count({
        where: {
          id: {
            in: taxRateIds,
          },
          OR: [
            {
              companyId: input.companyId,
            },
            {
              companyId: null,
              isSystem: true,
            },
          ],
        },
      });

      if (taxRateCount !== taxRateIds.length) {
        return {
          code: "TAX_RATE_NOT_FOUND",
          message: "A tax rate was not found for the active company.",
        };
      }
    }

    return null;
  }

  async getCustomerSnapshot(
    companyId: string,
    customerId: string,
  ) {
    const customer = await this.db.customer.findFirst({
      where: {
        id: customerId,
        companyId,
        isDeleted: false,
      },
      select: {
        name: true,
        email: true,
        phone: true,
        taxNumber: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        countryCode: true,
      },
    });

    if (!customer) return null;

    const billingAddress = [
      customer.addressLine1,
      customer.addressLine2,
      customer.city,
      customer.state,
      customer.postalCode,
      customer.countryCode,
    ].filter(Boolean).join(", ") || null;

    return {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      taxNumber: customer.taxNumber,
      billingAddress,
    };
  }
}
