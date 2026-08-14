import { prisma } from "../../../../../lib/prisma";
import type {
  CancelQuotationDto,
  CancelQuotationPersistenceResult,
  IQuotationCancellationRepository,
} from "../../../../application/quotation";
import { PrismaQuotationMapper } from "./PrismaQuotationMapper";
import { lockActiveQuotationForUpdate } from "./lockActiveQuotationForUpdate";

export class PrismaQuotationCancellationRepository
  implements IQuotationCancellationRepository {
  constructor(
    private readonly db = prisma,
  ) {}

  async cancel(
    params: CancelQuotationDto,
  ): Promise<CancelQuotationPersistenceResult> {
    return this.db.$transaction(async (tx) => {
      const locked = await lockActiveQuotationForUpdate(
        tx,
        params.companyId,
        params.quotationId,
      );

      if (!locked) {
        return { kind: "QUOTATION_NOT_FOUND" as const };
      }

      const record = await tx.quotation.findFirst({
        where: {
          id: params.quotationId,
          companyId: params.companyId,
          isDeleted: false,
        },
        include: { lines: true },
      });

      if (!record) {
        return { kind: "QUOTATION_NOT_FOUND" as const };
      }

      const existingSalesOrder = await tx.salesOrder.findFirst({
        where: {
          companyId: params.companyId,
          sourceQuotationId: params.quotationId,
        },
        select: { id: true },
      });

      if (existingSalesOrder) {
        return { kind: "QUOTATION_HAS_SALES_ORDER" as const };
      }

      const quotation = PrismaQuotationMapper.toDomain(record);
      quotation.cancel();

      const update = await tx.quotation.updateMany({
        where: {
          id: params.quotationId,
          companyId: params.companyId,
          isDeleted: false,
        },
        data: {
          status: quotation.status,
          cancelledAt: quotation.cancelledAt,
        },
      });

      if (update.count !== 1) {
        throw new Error("Failed to persist locked quotation cancellation.");
      }

      return { kind: "CANCELLED" as const };
    });
  }
}
