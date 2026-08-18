import type { PrismaClient } from '../../../../lib/generated/prisma/client';

export class CustomerCodeAllocator {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Atomically reserves one tenant-scoped sequence number.
   *
   * The transaction protects sequence allocation only.
   * Customer persistence happens afterwards, so a failed insert may
   * consume a number. Gaps are allowed; duplicate/reused codes are not.
   */
  async allocateNextCode(companyId: string): Promise<string> {
    const nextVal = await this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.customerSequence.upsert({
        where: { companyId },
        create: { companyId, nextValue: 2 },
        update: { nextValue: { increment: 1 } },
      });
      return updated.nextValue - 1;
    });

    return `CUST-${String(nextVal).padStart(6, '0')}`;
  }
}
