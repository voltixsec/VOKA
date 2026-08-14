import type { SalesOrder } from "@/src/domain/sales-order";

export type SalesOrderSerializationLocale = "ar" | "en";

function localized(
  locale: SalesOrderSerializationLocale | undefined,
  ar: string | null | undefined,
  en: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (locale === "ar") {
    return ar?.trim() || fallback?.trim() || en?.trim() || null;
  }
  if (locale === "en") {
    return en?.trim() || fallback?.trim() || ar?.trim() || null;
  }
  return fallback?.trim() || en?.trim() || ar?.trim() || null;
}

export function serializeSalesOrder(
  salesOrder: SalesOrder,
  locale?: SalesOrderSerializationLocale,
) {
  return {
    id: salesOrder.id,
    number: salesOrder.number,
    status: salesOrder.status,
    sourceQuotationId: salesOrder.sourceQuotationId,
    sourceQuotationNumber: salesOrder.sourceQuotationNumber,
    customerId: salesOrder.customerId,
    priceListId: salesOrder.priceListId,
    currencyCode: salesOrder.currencyCode,
    orderDate: salesOrder.orderDate.toISOString(),
    customer: {
      ...salesOrder.customer,
      name:
        localized(
          locale,
          salesOrder.customer.nameAr,
          salesOrder.customer.nameEn,
          salesOrder.customer.name,
        ) ?? salesOrder.customer.name,
    },
    subject: localized(
      locale,
      salesOrder.subjectAr,
      salesOrder.subjectEn,
      null,
    ),
    subjectAr: salesOrder.subjectAr,
    subjectEn: salesOrder.subjectEn,
    brief: localized(
      locale,
      salesOrder.briefAr,
      salesOrder.briefEn,
      null,
    ),
    briefAr: salesOrder.briefAr,
    briefEn: salesOrder.briefEn,
    projectName: localized(
      locale,
      salesOrder.projectNameAr,
      salesOrder.projectNameEn,
      salesOrder.projectName,
    ),
    projectNameAr: salesOrder.projectNameAr,
    projectNameEn: salesOrder.projectNameEn,
    attentionName: localized(
      locale,
      salesOrder.attentionNameAr,
      salesOrder.attentionNameEn,
      salesOrder.attentionName,
    ),
    attentionNameAr: salesOrder.attentionNameAr,
    attentionNameEn: salesOrder.attentionNameEn,
    scopeType: salesOrder.scopeType,
    lines: salesOrder.lines.map((line) => ({
      id: line.id,
      sourceQuotationLineId: line.sourceQuotationLineId,
      catalogItemId: line.catalogItemId,
      taxRateId: line.taxRateId,
      position: line.position,
      type: line.type,
      itemCode: line.itemCode,
      itemName:
        localized(
          locale,
          line.itemNameAr,
          line.itemNameEn,
          line.itemName,
        ) ?? line.itemName,
      itemNameAr: line.itemNameAr,
      itemNameEn: line.itemNameEn,
      description: localized(
        locale,
        line.descriptionAr,
        line.descriptionEn,
        line.description,
      ),
      descriptionAr: line.descriptionAr,
      descriptionEn: line.descriptionEn,
      unitName: localized(
        locale,
        line.unitNameAr,
        line.unitNameEn,
        line.unitName,
      ),
      unitNameAr: line.unitNameAr,
      unitNameEn: line.unitNameEn,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discountType
        ? {
            type: line.discountType,
            value: line.discountValue,
            amount: line.discountAmount,
          }
        : null,
      taxPercentage: line.taxPercentage,
      taxAmount: line.taxAmount,
      subtotal: line.subtotal,
      totalAmount: line.totalAmount,
    })),
    discount: salesOrder.discountType
      ? {
          type: salesOrder.discountType,
          value: salesOrder.discountValue,
          amount: salesOrder.discountAmount,
        }
      : null,
    totals: {
      subtotal: salesOrder.subtotal,
      discountAmount: salesOrder.discountAmount,
      taxAmount: salesOrder.taxAmount,
      totalAmount: salesOrder.totalAmount,
    },
    notes: localized(
      locale,
      salesOrder.notesAr,
      salesOrder.notesEn,
      salesOrder.notes,
    ),
    notesAr: salesOrder.notesAr,
    notesEn: salesOrder.notesEn,
    termsAndConditions: localized(
      locale,
      salesOrder.termsAndConditionsAr,
      salesOrder.termsAndConditionsEn,
      salesOrder.termsAndConditions,
    ),
    termsAndConditionsAr: salesOrder.termsAndConditionsAr,
    termsAndConditionsEn: salesOrder.termsAndConditionsEn,
    sourceApproval: {
      approvedAt: salesOrder.sourceApprovedAt.toISOString(),
      approvedByName: salesOrder.sourceApprovedByName,
      approvedByRole: salesOrder.sourceApprovedByRole,
    },
    creator: {
      userId: salesOrder.createdByUserId,
      name: salesOrder.createdByName,
      role: salesOrder.createdByRole,
    },
    createdAt: salesOrder.createdAt?.toISOString() ?? null,
    updatedAt: salesOrder.updatedAt?.toISOString() ?? null,
  };
}
