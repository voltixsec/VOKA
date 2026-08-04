import { prisma } from "../../../../../lib/prisma";

import type { IQuotationRepository } from "../../../../application/quotation/repositories/IQuotationRepository";
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
  ): Promise<void> {

    const data = PrismaQuotationMapper.toPersistence(
      quotation,
    );

    await this.db.quotation.create({
      data,
    });

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

}