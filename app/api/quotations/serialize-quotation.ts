import type { Quotation } from "@/src/domain/quotation";

export function serializeQuotation(
  quotation: Quotation,
) {
  const customer = quotation.customer.toJSON();

  return {
    id: quotation.id,
    companyId: quotation.companyId,
    customerId: quotation.customerId,
    priceListId: quotation.priceListId,
    quotationNumber: quotation.number.toString(),
    status: quotation.status,
    issueDate: quotation.issueDate.toISOString(),
    expiryDate:
      quotation.expiryDate?.toISOString() ?? null,
    currencyCode: quotation.currencyCode,
    customer,
    lines: quotation.lines.map((line) => ({
      id: line.id,
      catalogItemId: line.catalogItemId,
      taxRateId: line.taxRateId,
      position: line.position,
      type: line.type,
      itemCode: line.itemCode,
      itemName: line.itemName,
      description: line.description,
      unitName: line.unitName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      discountAmount: line.discountAmount,
      taxPercentage: line.taxPercentage,
      taxAmount: line.taxAmount,
      subtotal: line.subtotal,
      totalAmount: line.totalAmount,
    })),
    discount: quotation.discount,
    totals: {
      subtotal: quotation.totals.subtotal,
      discountAmount:
        quotation.totals.discountAmount,
      taxAmount: quotation.totals.taxAmount,
      totalAmount: quotation.totals.totalAmount,
    },
    notes: quotation.notes,
    termsAndConditions:
      quotation.termsAndConditions,
    sentAt:
      quotation.sentAt?.toISOString() ?? null,
    approvedAt:
      quotation.approvedAt?.toISOString() ?? null,
    rejectedAt:
      quotation.rejectedAt?.toISOString() ?? null,
    cancelledAt:
      quotation.cancelledAt?.toISOString() ?? null,
  };
}
