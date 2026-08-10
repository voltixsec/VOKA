import type { Prisma } from "../../../../../lib/generated/prisma/client";
import {
  Quotation,
  type Discount,
  type QuotationLineInput,
  type QuotationLineType,
  type QuotationStatus,
} from "../../../../domain/quotation";
import type { LocalizationStatus } from "../../../../domain/quotation/types/LocalizationStatus";

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
      customerNameAr: customer.nameAr,
      customerNameEn: customer.nameEn,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerTaxNo: customer.taxNumber,
      billingAddress: customer.billingAddress,
      subjectAr: quotation.subjectAr,
      subjectEn: quotation.subjectEn,
      briefAr: quotation.briefAr,
      briefEn: quotation.briefEn,
      projectName: quotation.projectName,
      projectNameAr: quotation.projectNameAr,
      projectNameEn: quotation.projectNameEn,
      attentionName: quotation.attentionName,
      attentionNameAr: quotation.attentionNameAr,
      attentionNameEn: quotation.attentionNameEn,
      scopeType: quotation.scopeType,
      subtotal: quotation.totals.subtotal,
      discountType: quotation.discount?.type ?? null,
      discountValue: quotation.discount?.value ?? 0,
      discountAmount: quotation.totals.discountAmount,
      taxAmount: quotation.totals.taxAmount,
      totalAmount: quotation.totals.totalAmount,
      notes: quotation.notes,
      notesAr: quotation.notesAr,
      notesEn: quotation.notesEn,
      termsAndConditions: quotation.termsAndConditions,
      termsAndConditionsAr: quotation.termsAndConditionsAr,
      termsAndConditionsEn: quotation.termsAndConditionsEn,
      localizationStatus: quotation.localizationStatus,
      localizationRequestedAt: quotation.localizationRequestedAt,
      localizationCompletedAt: quotation.localizationCompletedAt,
      localizationLastError: quotation.localizationLastError,
      localizationSourceLocale:
        quotation.localizationSourceLocale === "ar"
          ? "AR"
          : quotation.localizationSourceLocale === "en"
            ? "EN"
            : undefined,
      sentAt: quotation.sentAt,
      approvedAt: quotation.approvedAt,
      approvedByName: quotation.approvedByName,
      approvedByRole: quotation.approvedByRole,
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
          itemNameAr: line.itemNameAr ?? null,
          itemNameEn: line.itemNameEn ?? null,
          description: line.description ?? null,
          descriptionAr:
            line.descriptionAr ?? null,
          descriptionEn:
            line.descriptionEn ?? null,
          unitName: line.unitName ?? null,
          unitNameAr: line.unitNameAr ?? null,
          unitNameEn: line.unitNameEn ?? null,
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
      itemNameAr: line.itemNameAr,
      itemNameEn: line.itemNameEn,

      description: line.description,
      descriptionAr: line.descriptionAr,
      descriptionEn: line.descriptionEn,

      unitName: line.unitName,
      unitNameAr: line.unitNameAr,
      unitNameEn: line.unitNameEn,
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
        nameAr: record.customerNameAr,
        nameEn: record.customerNameEn,
        email: record.customerEmail,
        phone: record.customerPhone,
        taxNumber: record.customerTaxNo,
        billingAddress: record.billingAddress,
      },
      subjectAr: record.subjectAr,
      subjectEn: record.subjectEn,
      briefAr: record.briefAr,
      briefEn: record.briefEn,
      projectName: record.projectName,
      projectNameAr: record.projectNameAr,
      projectNameEn: record.projectNameEn,
      attentionName: record.attentionName,
      attentionNameAr: record.attentionNameAr,
      attentionNameEn: record.attentionNameEn,
      scopeType: record.scopeType,
      lines,
      discount,
      notes: record.notes,
      notesAr: record.notesAr,
      notesEn: record.notesEn,
      termsAndConditions: record.termsAndConditions,
      termsAndConditionsAr: record.termsAndConditionsAr,
      termsAndConditionsEn: record.termsAndConditionsEn,
      localizationStatus: record.localizationStatus
        ? (record.localizationStatus as LocalizationStatus)
        : undefined,
      localizationRequestedAt: record.localizationRequestedAt,
      localizationCompletedAt: record.localizationCompletedAt,
      localizationLastError: record.localizationLastError,
      localizationSourceLocale: record.localizationSourceLocale
        ? record.localizationSourceLocale.toLowerCase() as
            "ar" | "en"
        : null,
      sentAt: record.sentAt,
      approvedAt: record.approvedAt,
      approvedByName: record.approvedByName,
      approvedByRole: record.approvedByRole,
      rejectedAt: record.rejectedAt,
      cancelledAt: record.cancelledAt,
    });
  }

}