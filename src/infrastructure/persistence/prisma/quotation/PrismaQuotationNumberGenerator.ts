import { prisma } from "@/lib/prisma";
import type { IQuotationNumberGenerator } from "@/src/application/quotation/repositories/IQuotationNumberGenerator";

const SEQUENCE_WIDTH = 4;

function yearMonth(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Canonical tenant quotation number policy used by every production create path.
 * The persisted company/number/revision unique constraint remains the final
 * concurrency authority; callers may retry a conflicting allocation.
 */
export class PrismaQuotationNumberGenerator implements IQuotationNumberGenerator {
  constructor(private readonly db = prisma) {}

  async generate(companyId: string, issueDate: Date) {
    const prefix = `QT-${yearMonth(issueDate)}-`;
    const records = await this.db.quotation.findMany({
      where: {
        companyId,
        revisionNumber: 0,
        number: { startsWith: prefix },
      },
      select: { number: true },
    });
    const highest = records.reduce((max, record) => {
      const suffix = record.number.slice(prefix.length);
      return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
    }, 0);
    return `${prefix}${String(highest + 1).padStart(SEQUENCE_WIDTH, "0")}`;
  }
}
