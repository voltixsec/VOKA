import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  customer: { findFirst: vi.fn() }, quotation: { groupBy: vi.fn(), findMany: vi.fn() }, salesOrder: { groupBy: vi.fn(), findMany: vi.fn() }, contract: { groupBy: vi.fn(), findMany: vi.fn() }, invoice: { groupBy: vi.fn(), findMany: vi.fn() }, payment: { groupBy: vi.fn(), findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks }));
import { getCustomerActivitySnapshot } from '../customer-activity';

describe('getCustomerActivitySnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.customer.findFirst.mockResolvedValue({ id: 'customer-1', code: 'C-1', name: 'Customer', nameAr: null, nameEn: 'Customer' });
    for (const model of [mocks.quotation, mocks.salesOrder, mocks.contract, mocks.invoice, mocks.payment]) { model.groupBy.mockResolvedValue([]); model.findMany.mockResolvedValue([]); }
  });

  it('preserves the tenant-scoped eight-row screen projection', async () => {
    const snapshot = await getCustomerActivitySnapshot('tenant-trusted', 'customer-1', 'SCREEN');
    expect(snapshot.projection).toBe('SCREEN');
    for (const model of [mocks.quotation, mocks.salesOrder, mocks.contract, mocks.invoice]) expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'tenant-trusted', customerId: 'customer-1' }), take: 8 }));
    expect(mocks.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'tenant-trusted', invoice: { customerId: 'customer-1' } }, take: 8 }));
  });

  it('rejects an export when any module exceeds the safe 500-row limit', async () => {
    mocks.quotation.findMany.mockResolvedValue(Array.from({ length: 501 }, () => ({})));
    await expect(getCustomerActivitySnapshot('tenant-trusted', 'customer-1', 'EXPORT')).rejects.toMatchObject({ code: 'CUSTOMER_ACTIVITY_TOO_LARGE' });
    expect(mocks.quotation.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 501 }));
  });
});
