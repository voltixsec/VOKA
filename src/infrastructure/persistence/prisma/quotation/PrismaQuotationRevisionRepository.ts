import { Prisma } from "../../../../../lib/generated/prisma/client";
import { prisma } from "../../../../../lib/prisma";
import type {
  CreateQuotationRevisionResult,
  IQuotationRevisionRepository,
} from "../../../../application/quotation/repositories/IQuotationRevisionRepository";
import type { Quotation } from "../../../../domain/quotation";
import { PrismaQuotationMapper } from "./PrismaQuotationMapper";

export class PrismaQuotationRevisionRepository implements IQuotationRevisionRepository {
  constructor(private readonly db = prisma) {}

  async createFromApprovedSnapshot(
    companyId: string,
    quotationId: string,
  ): Promise<CreateQuotationRevisionResult> {
    return this.db.$transaction(async (tx) => {
      const initial = await tx.quotation.findFirst({
        where: { id: quotationId, companyId, isDeleted: false },
        select: { familyId: true },
      });
      if (!initial) return { kind: "NOT_FOUND" };

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:${initial.familyId}`}))`;

      const source = await tx.quotation.findFirst({
        where: { id: quotationId, companyId, isDeleted: false },
        include: { lines: true },
      });
      if (!source) return { kind: "NOT_FOUND" };
      if (!source.isCurrentRevision) return { kind: "NOT_CURRENT" };
      if (source.status !== "APPROVED") return { kind: "NOT_APPROVED" };

      const aggregate = await tx.quotation.aggregate({
        where: { companyId, familyId: source.familyId },
        _max: { revisionNumber: true },
      });
      const revisionNumber = (aggregate._max.revisionNumber ?? -1) + 1;
      const now = new Date();

      const superseded = await tx.quotation.updateMany({
        where: {
          id: source.id,
          companyId,
          isDeleted: false,
          isCurrentRevision: true,
          status: "APPROVED",
        },
        data: { isCurrentRevision: false, supersededAt: now },
      });
      if (superseded.count !== 1) return { kind: "NOT_CURRENT" };

      const {
        id: _id,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        lines,
        ...snapshot
      } = source;

      const created = await tx.quotation.create({
        data: {
          ...snapshot,
          revisionNumber,
          previousRevisionId: source.id,
          isCurrentRevision: true,
          supersededAt: null,
          status: "DRAFT",
          issueDate: now,
          sentAt: null,
          approvedAt: null,
          approvedByName: null,
          approvedByRole: null,
          verificationToken: null,
          rejectedAt: null,
          cancelledAt: null,
          localizationClaimToken: null,
          localizationLeaseUntil: null,
          lines: {
            create: lines.map(({ id: _lineId, quotationId: _quotationId, createdAt: _lineCreatedAt, updatedAt: _lineUpdatedAt, ...line }) => line),
          },
        } as Prisma.QuotationUncheckedCreateInput,
        include: { lines: true },
      });

      return { kind: "CREATED", quotation: PrismaQuotationMapper.toDomain(created) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async findFamilyHistory(
    companyId: string,
    quotationId: string,
  ): Promise<Quotation[] | null> {
    const anchor = await this.db.quotation.findFirst({
      where: { id: quotationId, companyId, isDeleted: false },
      select: { familyId: true },
    });
    if (!anchor) return null;

    const records = await this.db.quotation.findMany({
      where: { companyId, familyId: anchor.familyId, isDeleted: false },
      include: { lines: true },
      orderBy: { revisionNumber: "desc" },
    });
    return records.map(PrismaQuotationMapper.toDomain);
  }
}
