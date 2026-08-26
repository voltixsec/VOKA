import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ quotation: vi.fn(), contract: vi.fn(), invoice: vi.fn(), payment: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { quotation: { groupBy: mocks.quotation }, contract: { groupBy: mocks.contract }, invoice: { groupBy: mocks.invoice }, payment: { groupBy: mocks.payment } } }));
vi.mock('@/lib/api', () => ({
  apiSuccess: (data: unknown, init?: ResponseInit) => Response.json({ data }, init),
  withCompanyAuth: (_roles: readonly string[], handler: Function) => (request: Request) => handler(request, {}, { companyId: 'trusted-company' }),
}));
import { GET } from '../route';

describe('module summaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.quotation.mockResolvedValueOnce([{ status: 'DRAFT', _count: { _all: 2 } }]).mockResolvedValueOnce([{ currencyCode: 'KWD', _count: { _all: 2 }, _sum: { totalAmount: '12.000' } }]);
    mocks.contract.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mocks.invoice.mockResolvedValueOnce([{ status: 'ISSUED', _count: { _all: 1 } }]).mockResolvedValueOnce([{ currencyCode: 'USD', _count: { _all: 1 }, _sum: { totalAmount: '20.000', paidAmount: '5.000', outstandingAmount: '15.000' } }]);
    mocks.payment.mockResolvedValueOnce([{ currencyCode: 'USD', _count: { _all: 1 }, _sum: { amount: '5.000' } }]);
  });
  it('uses the trusted tenant and keeps currencies separated', async () => {
    const response = await GET(new Request('http://localhost/api/dashboard/module-summaries?companyId=attacker'));
    const body = await response.json();
    expect(body.data.quotations.byCurrency).toEqual([{ currencyCode: 'KWD', count: 2, totalAmount: '12.000' }]);
    expect(body.data.invoices.byCurrency[0]).toMatchObject({ currencyCode: 'USD', paidAmount: '5.000', outstandingAmount: '15.000' });
    expect(body.data.payments.byCurrency[0]).toMatchObject({ currencyCode: 'USD', collectedAmount: '5.000' });
    for (const mock of Object.values(mocks)) for (const call of mock.mock.calls) expect(call[0].where.companyId).toBe('trusted-company');
  });
});
