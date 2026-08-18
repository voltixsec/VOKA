import type { PrismaClient } from '../../../../lib/generated/prisma/client';

export class CustomerCodeAllocator {
  constructor(private readonly prisma: PrismaClient) {}

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
