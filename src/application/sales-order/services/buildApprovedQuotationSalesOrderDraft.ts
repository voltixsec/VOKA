import type {
  DiscountType,
  QuotationLineType,
  QuotationScopeType,
  QuotationStatus,
} from "../../../domain/quotation";
import {
  SalesOrder,
  SalesOrderDomainError,
} from "../../../domain/sales-order";

export type ApprovedQuotationLineSnapshot = {
  id: string;
  catalogItemId: string | null;
  taxRateId: string | null;
  position: number;
  type: QuotationLineType;
  itemCode: string | null;
  itemName: string;
  itemNameAr: string | null;
  itemNameEn: string | null;
  description: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  unitName: string | null;
  unitNameAr: string | null;
  unitNameEn: string | null;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType | null;
  discountValue: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  subtotal: number;
  totalAmount: number;
};

export type ApprovedQuotationSalesOrderSnapshot = {
  id: string;
  companyId: string;
  customerId: string;
  priceListId: string | null;
  number: string;
  status: QuotationStatus;
  currencyCode: string;
  customerName: string;
  customerNameAr: string | null;
  customerNameEn: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerTaxNo: string | null;
  billingAddress: string | null;
  subjectAr: string | null;
  subjectEn: string | null;
  briefAr: string | null;
  briefEn: string | null;
  projectName: string | null;
  projectNameAr: string | null;
  projectNameEn: string | null;
  attentionName: string | null;
  attentionNameAr: string | null;
  attentionNameEn: string | null;
  scopeType: QuotationScopeType | null;
  discountType: DiscountType | null;
  discountValue: number;
  discountAmount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  notesAr: string | null;
  notesEn: string | null;
  termsAndConditions: string | null;
  termsAndConditionsAr: string | null;
  termsAndConditionsEn: string | null;
  approvedAt: Date | null;
  approvedByName: string | null;
  approvedByRole: string | null;
  lines: ApprovedQuotationLineSnapshot[];
};

export type SalesOrderCreatorSnapshot = {
  userId: string;
  name: string;
  role: string;
};

export type BuildApprovedQuotationSalesOrderDraftResult =
  | { kind: "READY"; salesOrder: SalesOrder }
  | { kind: "INVALID_QUOTATION_STATUS"; status: QuotationStatus }
  | { kind: "INVALID_SOURCE_SNAPSHOT"; message: string };

export function buildApprovedQuotationSalesOrderDraft(
  quotation: ApprovedQuotationSalesOrderSnapshot,
  creator: SalesOrderCreatorSnapshot,
  orderDate: Date,
): BuildApprovedQuotationSalesOrderDraftResult {
  if (quotation.status !== "APPROVED") {
    return {
      kind: "INVALID_QUOTATION_STATUS",
      status: quotation.status,
    };
  }

  if (
    !quotation.approvedAt ||
    !quotation.approvedByName?.trim() ||
    !quotation.approvedByRole?.trim()
  ) {
    return {
      kind: "INVALID_SOURCE_SNAPSHOT",
      message: "The approved quotation is missing required approval audit data.",
    };
  }

  try {
    return {
      kind: "READY",
      salesOrder: new SalesOrder({
        companyId: quotation.companyId,
        sourceQuotationId: quotation.id,
        sourceQuotationNumber: quotation.number,
        number: `SO-${quotation.number}`,
        status: "DRAFT",
        customerId: quotation.customerId,
        priceListId: quotation.priceListId,
        currencyCode: quotation.currencyCode,
        orderDate,
        customer: {
          name: quotation.customerName,
          nameAr: quotation.customerNameAr,
          nameEn: quotation.customerNameEn,
          email: quotation.customerEmail,
          phone: quotation.customerPhone,
          taxNumber: quotation.customerTaxNo,
          billingAddress: quotation.billingAddress,
        },
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
        discountType: quotation.discountType,
        discountValue: quotation.discountValue,
        discountAmount: quotation.discountAmount,
        subtotal: quotation.subtotal,
        taxAmount: quotation.taxAmount,
        totalAmount: quotation.totalAmount,
        notes: quotation.notes,
        notesAr: quotation.notesAr,
        notesEn: quotation.notesEn,
        termsAndConditions: quotation.termsAndConditions,
        termsAndConditionsAr: quotation.termsAndConditionsAr,
        termsAndConditionsEn: quotation.termsAndConditionsEn,
        sourceApprovedAt: quotation.approvedAt,
        sourceApprovedByName: quotation.approvedByName,
        sourceApprovedByRole: quotation.approvedByRole,
        createdByUserId: creator.userId,
        createdByName: creator.name,
        createdByRole: creator.role,
        lines: quotation.lines.map((line) => ({
          sourceQuotationLineId: line.id,
          catalogItemId: line.catalogItemId,
          taxRateId: line.taxRateId,
          position: line.position,
          type: line.type,
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
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountType: line.discountType,
          discountValue: line.discountValue,
          discountAmount: line.discountAmount,
          taxPercentage: line.taxPercentage,
          taxAmount: line.taxAmount,
          subtotal: line.subtotal,
          totalAmount: line.totalAmount,
        })),
      }),
    };
  } catch (error) {
    if (error instanceof SalesOrderDomainError) {
      return { kind: "INVALID_SOURCE_SNAPSHOT", message: error.message };
    }
    throw error;
  }
}
