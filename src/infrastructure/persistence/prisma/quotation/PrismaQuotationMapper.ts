import type { Prisma } from "../../../../../lib/generated/prisma/client";
import {
  Quotation,
  type Discount,
  type QuotationLineInput,
  type QuotationLineType,
  type QuotationStatus,
} from "../../../../domain/quotation";

type QuotationRecord = Prisma.QuotationGetPayload<{
  include: {
    lines: true;
  };
}>;

export class PrismaQuotationMapper {

  static toPersistence(
    quotation: Quotation,
  ): Prisma.QuotationCreateInput {
    const customer = quotation.customer.toJSON();

    return {
      id: quotation.id,
      company: {
        connect: {
          id: quotation.companyId,
        },
      },
      customer: {
        connect: {
          id: quotation.customerId,
        },
      },
      ...(quotation.priceListId
        ? {
            priceList: {
              connect: {
                id: quotation.priceListId,
              },
            },
          }
        : {}),
      number: quotation.number.toString(),
      status: quotation.status,
      issueDate: quotation.issueDate,
      expiryDate: quotation.expiryDate,
      currencyCode: quotation.currencyCode,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerTaxNo: customer.taxNumber,
      billingAddress: customer.billingAddress,
      subtotal: quotation.totals.subtotal,
      discountType: quotation.discount?.type ?? null,
      discountValue: quotation.discount?.value ?? 0,
      discountAmount: quotation.totals.discountAmount,
      taxAmount: quotation.totals.taxAmount,
      totalAmount: quotation.totals.totalAmount,
      notes: quotation.notes,
      termsAndConditions: quotation.termsAndConditions,
      sentAt: quotation.sentAt,
      approvedAt: quotation.approvedAt,
      rejectedAt: quotation.rejectedAt,
      cancelledAt: quotation.cancelledAt,
      lines: {
        create: quotation.lines.map((line) => ({
          id: line.id,
          ...(line.catalogItemId
            ? {
                catalogItem: {
                  connect: {
                    id: line.catalogItemId,
                  },
                },
              }
            : {}),
          ...(line.taxRateId
            ? {
                taxRate: {
                  connect: {
                    id: line.taxRateId,
                  },
                },
              }
            : {}),
          position: line.position,
          type: line.type,
          itemCode: line.itemCode ?? null,
          itemName: line.itemName,
          description: line.description ?? null,
          unitName: line.unitName ?? null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountType: line.discount?.type ?? null,
          discountValue: line.discount?.value ?? 0,
          discountAmount: line.discountAmount,
          taxPercentage: line.taxPercentage ?? 0,
          taxAmount: line.taxAmount,
          subtotal: line.subtotal,
          totalAmount: line.totalAmount,
        })),
      },
    };
  }

  static toDomain(
    record: QuotationRecord,
  ): Quotation {
    const discount: Discount | null = record.discountType
      ? {
          type: record.discountType,
          value: Number(record.discountValue),
        }
      : null;

    const lines: QuotationLineInput[] = record.lines.map((line) => ({
      id: line.id,
      catalogItemId: line.catalogItemId,
      taxRateId: line.taxRateId,
      position: line.position,
      type: line.type as QuotationLineType,
      itemCode: line.itemCode,
      itemName: line.itemName,
      description: line.description,
      unitName: line.unitName,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      discount: line.discountType
        ? {
            type: line.discountType,
            value: Number(line.discountValue),
          }
        : null,
      taxPercentage: Number(line.taxPercentage),
    }));

    return Quotation.restore({
      id: record.id,
      companyId: record.companyId,
      customerId: record.customerId,
      priceListId: record.priceListId,
      number: record.number,
      status: record.status as QuotationStatus,
      issueDate: record.issueDate,
      expiryDate: record.expiryDate,
      currencyCode: record.currencyCode,
      customer: {
        name: record.customerName,
        email: record.customerEmail,
        phone: record.customerPhone,
        taxNumber: record.customerTaxNo,
        billingAddress: record.billingAddress,
      },
      lines,
      discount,
      notes: record.notes,
      termsAndConditions: record.termsAndConditions,
      sentAt: record.sentAt,
      approvedAt: record.approvedAt,
      rejectedAt: record.rejectedAt,
      cancelledAt: record.cancelledAt,
    });
  }

}