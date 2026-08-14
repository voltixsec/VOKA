import type { Prisma } from "../../../../../lib/generated/prisma/client";
import { prisma } from "../../../../../lib/prisma";
import type {
  ConvertApprovedQuotationParams,
  ISalesOrderRepository,
  SalesOrderConversionPersistenceResult,
  SalesOrderListFilters,
  SalesOrderListResult,
  ApprovedQuotationSalesOrderSnapshot,
} from "../../../../application/sales-order";
import { buildApprovedQuotationSalesOrderDraft } from "../../../../application/sales-order";
import { SalesOrder } from "../../../../domain/sales-order";
import {
  PrismaSalesOrderMapper,
  type PrismaSalesOrderRecord,
} from "./PrismaSalesOrderMapper";

const salesOrderInclude = {
  lines: {
    orderBy: {
      position: "asc" as const,
    },
  },
};

type PrismaApprovedQuotationRecord = Prisma.QuotationGetPayload<{
  include: { lines: true };
}>;

export class PrismaSalesOrderRepository implements ISalesOrderRepository {
  constructor(
    private readonly db = prisma,
  ) {}

  async convertApprovedQuotation(
    params: ConvertApprovedQuotationParams,
  ): Promise<SalesOrderConversionPersistenceResult> {
    try {
      return await this.db.$transaction(async (tx) => {
        const existing = await tx.salesOrder.findFirst({
          where: {
            companyId: params.companyId,
            sourceQuotationId: params.quotationId,
          },
          include: salesOrderInclude,
        });

        if (existing) {
          return {
            kind: "EXISTING" as const,
            salesOrder: PrismaSalesOrderMapper.toDomain(
              existing as PrismaSalesOrderRecord,
            ),
          };
        }

        const quotation = await tx.quotation.findFirst({
          where: {
            id: params.quotationId,
            companyId: params.companyId,
            isDeleted: false,
          },
          include: {
            lines: {
              orderBy: {
                position: "asc",
              },
            },
          },
        });

        if (!quotation) {
          return { kind: "QUOTATION_NOT_FOUND" as const };
        }

        const orderDate = new Date();
        const draft = buildApprovedQuotationSalesOrderDraft(
          toApprovedQuotationSnapshot(quotation),
          {
            userId: params.createdByUserId,
            name: params.createdByName,
            role: params.createdByRole,
          },
          orderDate,
        );

        if (draft.kind !== "READY") {
          return draft;
        }

        const salesOrder = draft.salesOrder;

        const created = await tx.salesOrder.create({
          data: {
            company: { connect: { id: quotation.companyId } },
            sourceQuotation: { connect: { id: quotation.id } },
            customer: { connect: { id: quotation.customerId } },
            ...(quotation.priceListId
              ? { priceList: { connect: { id: quotation.priceListId } } }
              : {}),
            createdByUser: { connect: { id: params.createdByUserId } },
            sourceQuotationNumber: quotation.number,
            number: salesOrder.number,
            status: salesOrder.status,
            currencyCode: quotation.currencyCode,
            orderDate,
            customerName: quotation.customerName,
            customerNameAr: quotation.customerNameAr,
            customerNameEn: quotation.customerNameEn,
            customerEmail: quotation.customerEmail,
            customerPhone: quotation.customerPhone,
            customerTaxNo: quotation.customerTaxNo,
            billingAddress: quotation.billingAddress,
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
            subtotal: quotation.subtotal,
            discountType: quotation.discountType,
            discountValue: quotation.discountValue,
            discountAmount: quotation.discountAmount,
            taxAmount: quotation.taxAmount,
            totalAmount: quotation.totalAmount,
            notes: quotation.notes,
            notesAr: quotation.notesAr,
            notesEn: quotation.notesEn,
            termsAndConditions: quotation.termsAndConditions,
            termsAndConditionsAr: quotation.termsAndConditionsAr,
            termsAndConditionsEn: quotation.termsAndConditionsEn,
            sourceApprovedAt: salesOrder.sourceApprovedAt,
            sourceApprovedByName: salesOrder.sourceApprovedByName,
            sourceApprovedByRole: salesOrder.sourceApprovedByRole,
            createdByName: params.createdByName,
            createdByRole: params.createdByRole,
            lines: {
              create: quotation.lines.map((line) => ({
                sourceQuotationLine: { connect: { id: line.id } },
                ...(line.catalogItemId
                  ? { catalogItem: { connect: { id: line.catalogItemId } } }
                  : {}),
                ...(line.taxRateId
                  ? { taxRate: { connect: { id: line.taxRateId } } }
                  : {}),
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
            },
          },
          include: salesOrderInclude,
        });

        return {
          kind: "CREATED" as const,
          salesOrder: PrismaSalesOrderMapper.toDomain(
            created as PrismaSalesOrderRecord,
          ),
        };
      });
    } catch (error) {
      if (!isSalesOrderIdentityUniqueConflict(error)) {
        throw error;
      }

      const existing = await this.findBySourceQuotation(
        params.companyId,
        params.quotationId,
      );

      if (!existing) {
        throw error;
      }

      return {
        kind: "EXISTING",
        salesOrder: existing,
      };
    }
  }

  async findById(
    companyId: string,
    salesOrderId: string,
  ): Promise<SalesOrder | null> {
    const record = await this.db.salesOrder.findFirst({
      where: { id: salesOrderId, companyId },
      include: salesOrderInclude,
    });

    return record
      ? PrismaSalesOrderMapper.toDomain(record as PrismaSalesOrderRecord)
      : null;
  }

  async findBySourceQuotation(
    companyId: string,
    quotationId: string,
  ): Promise<SalesOrder | null> {
    const record = await this.db.salesOrder.findFirst({
      where: { companyId, sourceQuotationId: quotationId },
      include: salesOrderInclude,
    });

    return record
      ? PrismaSalesOrderMapper.toDomain(record as PrismaSalesOrderRecord)
      : null;
  }

  async existsBySourceQuotation(
    companyId: string,
    quotationId: string,
  ): Promise<boolean> {
    const record = await this.db.salesOrder.findFirst({
      where: { companyId, sourceQuotationId: quotationId },
      select: { id: true },
    });

    return record !== null;
  }

  async findAll(
    filters: SalesOrderListFilters,
  ): Promise<SalesOrderListResult> {
    const search = filters.search?.trim();
    const where = {
      companyId: filters.companyId,
      status: filters.status,
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: "insensitive" as const } },
              {
                sourceQuotationNumber: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                customerName: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.db.salesOrder.findMany({
        where,
        include: salesOrderInclude,
        orderBy: [
          { orderDate: "desc" },
          { createdAt: "desc" },
        ],
        skip: filters.skip,
        take: filters.take,
      }),
      this.db.salesOrder.count({ where }),
    ]);

    return {
      salesOrders: records.map((record) =>
        PrismaSalesOrderMapper.toDomain(record as PrismaSalesOrderRecord),
      ),
      total,
    };
  }
}

function toApprovedQuotationSnapshot(
  quotation: PrismaApprovedQuotationRecord,
): ApprovedQuotationSalesOrderSnapshot {
  return {
    id: quotation.id,
    companyId: quotation.companyId,
    customerId: quotation.customerId,
    priceListId: quotation.priceListId,
    number: quotation.number,
    status: quotation.status,
    currencyCode: quotation.currencyCode,
    customerName: quotation.customerName,
    customerNameAr: quotation.customerNameAr,
    customerNameEn: quotation.customerNameEn,
    customerEmail: quotation.customerEmail,
    customerPhone: quotation.customerPhone,
    customerTaxNo: quotation.customerTaxNo,
    billingAddress: quotation.billingAddress,
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
    discountValue: Number(quotation.discountValue),
    discountAmount: Number(quotation.discountAmount),
    subtotal: Number(quotation.subtotal),
    taxAmount: Number(quotation.taxAmount),
    totalAmount: Number(quotation.totalAmount),
    notes: quotation.notes,
    notesAr: quotation.notesAr,
    notesEn: quotation.notesEn,
    termsAndConditions: quotation.termsAndConditions,
    termsAndConditionsAr: quotation.termsAndConditionsAr,
    termsAndConditionsEn: quotation.termsAndConditionsEn,
    approvedAt: quotation.approvedAt,
    approvedByName: quotation.approvedByName,
    approvedByRole: quotation.approvedByRole,
    lines: quotation.lines.map((line) => ({
      id: line.id,
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
    })),
  };
}

function isSalesOrderIdentityUniqueConflict(error: unknown): boolean {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = "meta" in error
    ? (error.meta as { target?: unknown } | undefined)?.target
    : undefined;
  const normalized = Array.isArray(target)
    ? target.join(",")
    : String(target ?? "");

  return (
    normalized.includes("sourceQuotationId") ||
    normalized.includes("SalesOrder_sourceQuotationId_key") ||
    normalized.includes("SalesOrder_companyId_number_key") ||
    (normalized.includes("companyId") && normalized.includes("number"))
  );
}
