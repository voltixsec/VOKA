import type { PrismaClient } from "../../../../../lib/generated/prisma/client";
import type {
  IContractRepository,
  ListContractsOptions,
  ListContractsResult,
} from "../../../../application/contract/repositories/IContractRepository";
import type { Contract } from "../../../../domain/contract";
import { PrismaContractMapper } from "./PrismaContractMapper";

export class PrismaContractRepository implements IContractRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getNextContractNumber(companyId: string): Promise<string> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    const nextValue = await this.prisma.$transaction(async (tx: any) => {
      const sequence = await tx.contractNumberSequence.upsert({
        where: {
          companyId_yearMonth: {
            companyId,
            yearMonth,
          },
        },
        create: {
          companyId,
          yearMonth,
          nextValue: 2,
        },
        update: {
          nextValue: {
            increment: 1,
          },
        },
      });

      return sequence.nextValue - 1;
    });

    return `CN-${yearMonth}-${String(nextValue).padStart(4, "0")}`;
  }
  async save(contract: Contract): Promise<Contract> {
    const data = {
      companyId: contract.companyId,
      number: contract.number.value,
      status: contract.status as any,
      origin: contract.provenance.origin as any,
      sourceKind: contract.provenance.sourceKind,
      sourceId: contract.provenance.sourceId,
      customerId: contract.customerId,
      priceListId: contract.priceListId,
      currencyCode: contract.currencyCode,
      contractDate: contract.contractDate,
      startDate: contract.startDate,
      endDate: contract.endDate,
      customerName: contract.customer.name,
      customerNameAr: contract.customer.nameAr,
      customerNameEn: contract.customer.nameEn,
      customerEmail: contract.customer.email,
      customerPhone: contract.customer.phone,
      customerTaxNo: contract.customer.taxNumber,
      billingAddress: contract.customer.billingAddress,
      subjectAr: contract.subjectAr,
      subjectEn: contract.subjectEn,
      briefAr: contract.briefAr,
      briefEn: contract.briefEn,
      projectName: contract.projectName,
      projectNameAr: contract.projectNameAr,
      projectNameEn: contract.projectNameEn,
      attentionName: contract.attentionName,
      attentionNameAr: contract.attentionNameAr,
      attentionNameEn: contract.attentionNameEn,
      scopeType: contract.scopeType,
      subtotal: contract.subtotal,
      discountType: contract.discountType,
      discountValue: contract.discountValue,
      discountAmount: contract.discountAmount,
      taxAmount: contract.taxAmount,
      totalAmount: contract.totalAmount,
      notes: contract.notes,
      notesAr: contract.notesAr,
      notesEn: contract.notesEn,
      termsAndConditions: contract.termsAndConditions,
      termsAndConditionsAr: contract.termsAndConditionsAr,
      termsAndConditionsEn: contract.termsAndConditionsEn,
      createdByUserId: contract.createdByUserId,
      createdByName: contract.createdByName,
      createdByRole: contract.createdByRole,
      documentBrandSnapshot: contract.documentBrandSnapshot ? (contract.documentBrandSnapshot as any) : undefined,
      lines: {
        create: contract.lines.map((line) => ({
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
      milestones: {
        create: contract.milestones.map((m) => ({
          position: m.position,
          title: m.title,
          titleAr: m.titleAr,
          titleEn: m.titleEn,
          description: m.description,
          descriptionAr: m.descriptionAr,
          descriptionEn: m.descriptionEn,
          amountType: m.amountType as any,
          percentage: m.percentage,
          fixedAmount: m.fixedAmount,
          dueDate: m.dueDate,
        })),
      },
    };

    if (contract.id) {
      const updated = await this.prisma.contract.update({
        where: {
          id: contract.id,
          companyId: contract.companyId,
        },
        data,
        include: {
          lines: true,
          milestones: true,
        },
      });
      return PrismaContractMapper.toDomain(updated);
    }

    const created = await this.prisma.contract.create({
      data,
      include: {
        lines: true,
        milestones: true,
      },
    });

    return PrismaContractMapper.toDomain(created);
  }

  async findById(companyId: string, id: string): Promise<Contract | null> {
    const record = await this.prisma.contract.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        lines: {
          orderBy: { position: "asc" },
        },
        milestones: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!record) {
      return null;
    }

    return PrismaContractMapper.toDomain(record);
  }

  async findByNumber(companyId: string, number: string): Promise<Contract | null> {
    const record = await this.prisma.contract.findFirst({
      where: {
        companyId,
        number,
      },
      include: {
        lines: {
          orderBy: { position: "asc" },
        },
        milestones: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!record) {
      return null;
    }

    return PrismaContractMapper.toDomain(record);
  }

  async list(options: ListContractsOptions): Promise<ListContractsResult> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.max(1, Math.min(100, options.pageSize || 10));
    const skip = (page - 1) * pageSize;

    const where: any = {
      companyId: options.companyId,
    };

    if (options.status) {
      where.status = options.status;
    }

    if (options.customerId) {
      where.customerId = options.customerId;
    }

    if (options.search?.trim()) {
      const search = options.search.trim();
      where.OR = [
        { number: { contains: search, mode: "insensitive" } },
        { customerName: { contains: search, mode: "insensitive" } },
        { projectName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.contract.count({ where }),
      this.prisma.contract.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          lines: {
            orderBy: { position: "asc" },
          },
          milestones: {
            orderBy: { position: "asc" },
          },
        },
      }),
    ]);

    return {
      items: records.map(PrismaContractMapper.toDomain),
      total,
      page,
      pageSize,
    };
  }
}
