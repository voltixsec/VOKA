import type {
  Quotation,
} from "@/src/domain/quotation";

export type QuotationSerializationLocale =
  | "ar"
  | "en";

function pickLocalized(
  locale: QuotationSerializationLocale | undefined,
  ar: string | null | undefined,
  en: string | null | undefined,
  fallback: string | null | undefined,
  isCompleted: boolean = false,
): string | null {
  if (locale === "ar") {
    const arVal = ar?.trim() || null;
    if (arVal) return arVal;
    if (isCompleted) return null;
    return fallback?.trim() || en?.trim() || null;
  }

  if (locale === "en") {
    const enVal = en?.trim() || null;
    if (enVal) return enVal;
    if (isCompleted) return null;
    return fallback?.trim() || ar?.trim() || null;
  }

  return (
    fallback?.trim() ||
    en?.trim() ||
    ar?.trim() ||
    null
  );
}

export function serializeQuotation(
  quotation: Quotation,
  locale?: QuotationSerializationLocale,
) {
  const customer =
    quotation.customer.toJSON();
  const isCompleted = quotation.localizationStatus === "COMPLETED";

  return {
    id: quotation.id,
    companyId: quotation.companyId,
    customerId: quotation.customerId,
    priceListId: quotation.priceListId,

    quotationNumber:
      quotation.number.toString(),

    status: quotation.status,

    issueDate:
      quotation.issueDate.toISOString(),

    expiryDate:
      quotation.expiryDate
        ?.toISOString() ?? null,

    currencyCode:
      quotation.currencyCode,

    customer: {
      ...customer,

      name:
        pickLocalized(
          locale,
          customer.nameAr,
          customer.nameEn,
          customer.name,
          isCompleted,
        ) ?? customer.name,
    },

    subject:
      pickLocalized(
        locale,
        quotation.subjectAr,
        quotation.subjectEn,
        null,
        isCompleted,
      ),

    subjectAr:
      quotation.subjectAr,

    subjectEn:
      quotation.subjectEn,

    brief:
      pickLocalized(
        locale,
        quotation.briefAr,
        quotation.briefEn,
        null,
        isCompleted,
      ),

    briefAr:
      quotation.briefAr,

    briefEn:
      quotation.briefEn,

    projectName:
      pickLocalized(
        locale,
        quotation.projectNameAr,
        quotation.projectNameEn,
        quotation.projectName,
        isCompleted,
      ),

    projectNameAr:
      quotation.projectNameAr,

    projectNameEn:
      quotation.projectNameEn,

    attentionName:
      pickLocalized(
        locale,
        quotation.attentionNameAr,
        quotation.attentionNameEn,
        quotation.attentionName,
        isCompleted,
      ),

    attentionNameAr:
      quotation.attentionNameAr,

    attentionNameEn:
      quotation.attentionNameEn,

    scopeType:
      quotation.scopeType,

    lines:
      quotation.lines.map(
        (line) => ({
          id: line.id,

          catalogItemId:
            line.catalogItemId,

          taxRateId:
            line.taxRateId,

          position:
            line.position,

          type:
            line.type,

          itemCode:
            line.itemCode,

          itemName:
            pickLocalized(
              locale,
              line.itemNameAr,
              line.itemNameEn,
              line.itemName,
              isCompleted,
            ) ?? line.itemName,

          itemNameAr:
            line.itemNameAr,

          itemNameEn:
            line.itemNameEn,

          description:
            pickLocalized(
              locale,
              line.descriptionAr,
              line.descriptionEn,
              line.description,
              isCompleted,
            ),

          descriptionAr:
            line.descriptionAr,

          descriptionEn:
            line.descriptionEn,

          unitName:
            pickLocalized(
              locale,
              line.unitNameAr,
              line.unitNameEn,
              line.unitName,
              isCompleted,
            ),

          unitNameAr:
            line.unitNameAr,

          unitNameEn:
            line.unitNameEn,

          quantity:
            line.quantity,

          unitPrice:
            line.unitPrice,

          discount:
            line.discount,

          discountAmount:
            line.discountAmount,

          taxPercentage:
            line.taxPercentage,

          taxAmount:
            line.taxAmount,

          subtotal:
            line.subtotal,

          totalAmount:
            line.totalAmount,
        }),
      ),

    discount:
      quotation.discount,

    totals: {
      subtotal:
        quotation.totals.subtotal,

      discountAmount:
        quotation.totals
          .discountAmount,

      taxAmount:
        quotation.totals.taxAmount,

      totalAmount:
        quotation.totals.totalAmount,
    },

    notes:
      pickLocalized(
        locale,
        quotation.notesAr,
        quotation.notesEn,
        quotation.notes,
        isCompleted,
      ),

    notesAr:
      quotation.notesAr,

    notesEn:
      quotation.notesEn,

    termsAndConditions:
      pickLocalized(
        locale,
        quotation.termsAndConditionsAr,
        quotation.termsAndConditionsEn,
        quotation.termsAndConditions,
        isCompleted,
      ),

    termsAndConditionsAr:
      quotation.termsAndConditionsAr,

    termsAndConditionsEn:
      quotation.termsAndConditionsEn,

    localizationStatus:
      quotation.localizationStatus,

    localizationRequestedAt:
      quotation.localizationRequestedAt
        ?.toISOString() ?? null,

    localizationCompletedAt:
      quotation.localizationCompletedAt
        ?.toISOString() ?? null,

    localizationLastError:
      quotation.localizationLastError,

    localizationSourceLocale:
      quotation.localizationSourceLocale,

    sentAt:
      quotation.sentAt
        ?.toISOString() ?? null,

    approvedAt:
      quotation.approvedAt
        ?.toISOString() ?? null,

    approvedByName:
      quotation.approvedByName,

    approvedByRole:
      quotation.approvedByRole,

    rejectedAt:
      quotation.rejectedAt
        ?.toISOString() ?? null,

    cancelledAt:
      quotation.cancelledAt
        ?.toISOString() ?? null,
  };
}
