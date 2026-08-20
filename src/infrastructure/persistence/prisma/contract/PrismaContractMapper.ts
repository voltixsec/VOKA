import type { Prisma } from "../../../../../lib/generated/prisma/client";
import { CommercialDocumentProvenance } from "../../../../domain/commercial";
import { Contract } from "../../../../domain/contract";
import { parseCompanyDocumentBrandSnapshot } from "../../../../domain/document/CompanyDocumentBrandSnapshot";

export type PrismaContractRecord = Prisma.ContractGetPayload<{
  include: {
    lines: true;
    milestones: true;
  };
}>;

export class PrismaContractMapper {
  static toDomain(record: PrismaContractRecord): Contract {
    const lines = record.lines.map((line) => ({
      id: line.id,
      sourceLineId: line.sourceLineId,
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
    }));

    const milestones = record.milestones.map((m) => ({
      id: m.id,
      contractId: m.contractId,
      position: m.position,
      title: m.title,
      titleAr: m.titleAr,
      titleEn: m.titleEn,
      description: m.description,
      descriptionAr: m.descriptionAr,
      descriptionEn: m.descriptionEn,
      amountType: m.amountType,
      percentage: m.percentage !== null ? Number(m.percentage) : null,
      fixedAmount: m.fixedAmount !== null ? Number(m.fixedAmount) : null,
      dueDate: m.dueDate,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));

    const provenance = new CommercialDocumentProvenance({
      origin: record.origin,
      sourceKind: record.sourceKind as any,
      sourceId: record.sourceId,
    });

    return Contract.restore({
      id: record.id,
      companyId: record.companyId,
      number: record.number,
      status: record.status as any,
      provenance,
      customerId: record.customerId,
      priceListId: record.priceListId,
      currencyCode: record.currencyCode,
      contractDate: record.contractDate,
      startDate: record.startDate,
      endDate: record.endDate,
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
      lines,
      milestones,
      notes: record.notes,
      notesAr: record.notesAr,
      notesEn: record.notesEn,
      termsAndConditions: record.termsAndConditions,
      termsAndConditionsAr: record.termsAndConditionsAr,
      termsAndConditionsEn: record.termsAndConditionsEn,
      documentBrandSnapshot: parseCompanyDocumentBrandSnapshot(record.documentBrandSnapshot),
      createdByUserId: record.createdByUserId,
      createdByName: record.createdByName,
      createdByRole: record.createdByRole,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
