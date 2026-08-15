import { prisma } from '@/lib/prisma';
import type { QuotationCustomerContactRepository } from '@/src/application/quotation-delivery/QuotationCustomerContactRepository';

export class PrismaQuotationCustomerContactRepository implements QuotationCustomerContactRepository {
  async find(companyId: string, customerId: string) {
    return prisma.customer.findFirst({
      where: { id: customerId, companyId, isDeleted: false },
      select: { id: true, email: true, whatsapp: true },
    }).then((customer) => customer ? {
      customerId: customer.id, email: customer.email, whatsapp: customer.whatsapp,
    } : null);
  }

  async updateSelected(input: { companyId: string; customerId: string; email?: string; whatsapp?: string }) {
    const result = await prisma.customer.updateMany({
      where: { id: input.customerId, companyId: input.companyId, isDeleted: false },
      data: {
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp } : {}),
      },
    });
    return result.count === 1;
  }
}
