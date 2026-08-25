import type { Invoice } from "@/src/domain/invoice";

export function serializeInvoice(invoice: Invoice) {
  return {
    id: invoice.id, number: invoice.number, status: invoice.status,
    settlementStatus: invoice.settlementStatus, origin: invoice.origin,
    sourceKind: invoice.sourceKind, sourceId: invoice.sourceId,
    sourceQuotationFamilyId: invoice.sourceQuotationFamilyId,
    sourceQuotationRevisionNumber: invoice.sourceQuotationRevisionNumber,
    customerId: invoice.customerId, priceListId: invoice.priceListId,
    currencyCode: invoice.currencyCode, invoiceDate: invoice.invoiceDate.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null, customer: invoice.customer,
    lines: invoice.lines, discount: invoice.discount, totals: invoice.totals,
    paidAmount: invoice.paidAmount, outstandingAmount: invoice.outstandingAmount,
    notes: invoice.notes, termsAndConditions: invoice.termsAndConditions,
    createdBy: invoice.createdBy, issuedAt: invoice.issuedAt?.toISOString() ?? null,
    issuedBy: invoice.issuedBy, voidedAt: invoice.voidedAt?.toISOString() ?? null,
    voidedBy: invoice.voidedBy, voidReason: invoice.voidReason,
    createdAt: invoice.createdAt?.toISOString() ?? null,
    updatedAt: invoice.updatedAt?.toISOString() ?? null,
  };
}
