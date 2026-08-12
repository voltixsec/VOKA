import { prisma } from "../../../../../lib/prisma";

import type {
  IQuotationRepository,
  QuotationListFilters,
  QuotationListResult,
  QuotationLocalizationClaim,
  QuotationLocalizationClaimParams,
  CompleteQuotationLocalizationParams,
  FailQuotationLocalizationParams,
} from "../../../../application/quotation/repositories/IQuotationRepository";
import type { Quotation } from "../../../../domain/quotation/entities/Quotation";
import { PrismaQuotationMapper } from "./PrismaQuotationMapper";

export class PrismaQuotationRepository implements IQuotationRepository {

  constructor(
    private readonly db = prisma,
  ) {}

  async existsByNumber(
    companyId: string,
    number: string,
  ): Promise<boolean> {

    const quotation = await this.db.quotation.findFirst({
      where: {
        companyId,
        number,
        isDeleted: false,
      },
      select: {
        id: true,
      },
    });

    return quotation !== null;

  }

  async save(
    quotation: Quotation,
  ): Promise<Quotation> {

    const data = PrismaQuotationMapper.toPersistence(
      quotation,
    );

    const record = await this.db.quotation.create({
      data,
      include: {
        lines: true,
      },
    });

    return PrismaQuotationMapper.toDomain(record);

  }

  async findById(
    companyId: string,
    id: string,
  ): Promise<Quotation | null> {

    const record = await this.db.quotation.findFirst({
      where: {
        id,
        isDeleted: false,
        companyId,
      },
      include: {
        lines: true,
      },
    });

    if (!record) {
      return null;
    }

    return PrismaQuotationMapper.toDomain(record);

  }

  async findAll(
    filters: QuotationListFilters,
  ): Promise<QuotationListResult> {
    const search = filters.search?.trim();
    const where = {
      companyId: filters.companyId,
      isDeleted: false,
      status: filters.status,
      customerId: filters.customerId,
      ...(search
        ? {
            OR: [
              {
                number: {
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
      this.db.quotation.findMany({
        where,
        include: {
          lines: true,
        },
        orderBy: [
          { issueDate: "desc" },
          { createdAt: "desc" },
        ],
        skip: filters.skip,
        take: filters.take,
      }),
      this.db.quotation.count({ where }),
    ]);

    return {
      quotations: records.map(PrismaQuotationMapper.toDomain),
      total,
    };
  }
  async update(
    companyId: string,
    quotation: Quotation,
  ): Promise<void> {

    const data = PrismaQuotationMapper.toPersistence(
      quotation,
    );

    await this.db.$transaction(async (tx) => {

      await tx.quotation.update({
        where: {
          companyId,
          id: quotation.id,
        },
        data: {
          ...data,
          lines: undefined,
        },
      });

      await tx.quotationLine.deleteMany({
        where: {
          quotationId: quotation.id,
        },
      });

      await tx.quotation.update({
        where: {
          companyId,
          id: quotation.id,
        },
        data: {
          lines: data.lines,
        },
      });

    });

  }

  async delete(
    companyId: string,
    id: string,
  ): Promise<void> {

    await this.db.quotation.update({
      where: {
        id,
        companyId,
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

  }

  async claimLocalization(
    params: QuotationLocalizationClaimParams,
  ): Promise<QuotationLocalizationClaim | null> {
    const { companyId, quotationId, leaseDurationMs } = params;
    const claimToken = params.claimToken || crypto.randomUUID();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    const result = await this.db.quotation.updateMany({
      where: {
        companyId,
        id: quotationId,
        isDeleted: false,
        localizationSourceSignature: { not: null },
        localizationAttemptCount: { lt: 3 },
        AND: [
          {
            OR: [
              { localizationLeaseUntil: null },
              { localizationLeaseUntil: { lt: now } },
            ],
          },
          {
            OR: [
              { localizationStatus: "PENDING" },
              {
                localizationStatus: "FAILED",
                localizationLastError: {
                  in: [
                    "TRANSLATION_TIMEOUT",
                    "TRANSLATION_PROVIDER_ERROR",
                    "TRANSLATION_UNEXPECTED_ERROR",
                  ],
                },
              },
            ],
          },
        ],
      },
      data: {
        localizationClaimToken: claimToken,
        localizationLeaseUntil: leaseExpiresAt,
        localizationAttemptCount: { increment: 1 },
        localizationStatus: "PENDING",
        localizationLastError: null,
      },
    });

    if (result.count === 0) {
      return null;
    }

    const claimedRecord = await this.db.quotation.findFirst({
      where: {
        id: quotationId,
        companyId,
        localizationClaimToken: claimToken,
      },
      select: {
        localizationSourceSignature: true,
        localizationAttemptCount: true,
      },
    });

    if (!claimedRecord || !claimedRecord.localizationSourceSignature) {
      return null;
    }

    return {
      claimToken,
      sourceSignature: claimedRecord.localizationSourceSignature,
      attemptCount: claimedRecord.localizationAttemptCount,
    };
  }

  async completeLocalization(
    params: CompleteQuotationLocalizationParams,
  ): Promise<boolean> {
    const {
      companyId,
      quotationId,
      expectedSourceSignature,
      expectedClaimToken,
      header,
      lines,
      completedAt,
    } = params;

    return await this.db.$transaction(async (tx) => {
      const quotationUpdate = await tx.quotation.updateMany({
        where: {
          companyId,
          id: quotationId,
          isDeleted: false,
          localizationSourceSignature: expectedSourceSignature,
          localizationClaimToken: expectedClaimToken,
        },
        data: {
          customerNameAr: header.customerNameAr,
          customerNameEn: header.customerNameEn,
          projectNameAr: header.projectNameAr,
          projectNameEn: header.projectNameEn,
          attentionNameAr: header.attentionNameAr,
          attentionNameEn: header.attentionNameEn,
          subjectAr: header.subjectAr,
          subjectEn: header.subjectEn,
          briefAr: header.briefAr,
          briefEn: header.briefEn,
          notesAr: header.notesAr,
          notesEn: header.notesEn,
          termsAndConditionsAr: header.termsAndConditionsAr,
          termsAndConditionsEn: header.termsAndConditionsEn,
          localizationStatus: "COMPLETED",
          localizationCompletedAt: completedAt,
          localizationLastError: null,
          localizationClaimToken: null,
          localizationLeaseUntil: null,
        },
      });

      if (quotationUpdate.count !== 1) {
        return false;
      }

      for (const line of lines) {
        const lineUpdate = await tx.quotationLine.updateMany({
          where: {
            id: line.id,
            quotationId,
          },
          data: {
            itemNameAr: line.itemNameAr,
            itemNameEn: line.itemNameEn,
            descriptionAr: line.descriptionAr,
            descriptionEn: line.descriptionEn,
            unitNameAr: line.unitNameAr,
            unitNameEn: line.unitNameEn,
          },
        });

        if (lineUpdate.count !== 1) {
          throw new Error(
            `Failed to update localized line ${line.id}`,
          );
        }
      }

      return true;
    });
  }

  async failLocalization(
    params: FailQuotationLocalizationParams,
  ): Promise<boolean> {
    const {
      companyId,
      quotationId,
      expectedSourceSignature,
      expectedClaimToken,
      errorCode,
    } = params;

    const result = await this.db.quotation.updateMany({
      where: {
        companyId,
        id: quotationId,
        isDeleted: false,
        localizationSourceSignature: expectedSourceSignature,
        localizationClaimToken: expectedClaimToken,
      },
      data: {
        localizationStatus: "FAILED",
        localizationLastError: errorCode,
        localizationCompletedAt: null,
        localizationClaimToken: null,
        localizationLeaseUntil: null,
      },
    });

    return result.count === 1;
  }

}