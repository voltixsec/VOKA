import type { Prisma } from "../../../../../lib/generated/prisma/client";
import { parseCompanyDocumentBrandSnapshot } from "../../../../domain/document/CompanyDocumentBrandSnapshot";
import {
  SalesOrder,
  type SalesOrderLineSnapshot,
} from "../../../../domain/sales-order";

export type PrismaSalesOrderRecord = Prisma.SalesOrderGetPayload<{
  include: {
    lines: true;
  };
}>;

export class PrismaSalesOrderMapper {
  static toDomain(record: PrismaSalesOrderRecord): SalesOrder {
    const lines: SalesOrderLineSnapshot[] = record.lines.map((line) => ({
      id: line.id,
      sourceQuotationLineId: line.sourceQuotationLineId,
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
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      discountType: line.discountType,
      discountValue: Number(line.discountValue),
      discountAmount: Number(line.discountAmount),
      taxPercentage: Number(line.taxPercentage),
      taxAmount: Number(line.taxAmount),
      subtotal: Number(line.subtotal),
      totalAmount: Number(line.totalAmount),
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
    }));

    return SalesOrder.restore({
      id: record.id,
      companyId: record.companyId,
      sourceQuotationId: record.sourceQuotationId,
      sourceQuotationNumber: record.sourceQuotationNumber,
      number: record.number,
      status: record.status,
      customerId: record.customerId,
      priceListId: record.priceListId,
      currencyCode: record.currencyCode,
      orderDate: record.orderDate,
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
      discountType: record.discountType,
      discountValue: Number(record.discountValue),
      discountAmount: Number(record.discountAmount),
      subtotal: Number(record.subtotal),
      taxAmount: Number(record.taxAmount),
      totalAmount: Number(record.totalAmount),
      notes: record.notes,
      notesAr: record.notesAr,
      notesEn: record.notesEn,
      termsAndConditions: record.termsAndConditions,
      termsAndConditionsAr: record.termsAndConditionsAr,
      termsAndConditionsEn: record.termsAndConditionsEn,
      sourceApprovedAt: record.sourceApprovedAt,
      sourceApprovedByName: record.sourceApprovedByName,
      sourceApprovedByRole: record.sourceApprovedByRole,
      documentBrandSnapshot: parseCompanyDocumentBrandSnapshot(
        record.documentBrandSnapshot,
      ),
      createdByUserId: record.createdByUserId,
      createdByName: record.createdByName,
      createdByRole: record.createdByRole,
      confirmedAt: record.confirmedAt,
      confirmedByUserId: record.confirmedByUserId,
      confirmedByName: record.confirmedByName,
      confirmedByRole: record.confirmedByRole,
      cancelledAt: record.cancelledAt,
      cancelledByUserId: record.cancelledByUserId,
      cancelledByName: record.cancelledByName,
      cancelledByRole: record.cancelledByRole,
      cancellationReason: record.cancellationReason,
      lines,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
