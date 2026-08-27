import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ customer: vi.fn(), catalogItem: vi.fn(), quotation: vi.fn(), salesOrder: vi.fn(), contract: vi.fn(), invoice: vi.fn(), payment: vi.fn(), quotationGroup: vi.fn(), contractGroup: vi.fn(), invoiceGroup: vi.fn(), paymentGroup: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { customer: { count: mocks.customer }, catalogItem: { count: mocks.catalogItem }, quotation: { count: mocks.quotation, groupBy: mocks.quotationGroup }, salesOrder: { count: mocks.salesOrder }, contract: { count: mocks.contract, groupBy: mocks.contractGroup }, invoice: { count: mocks.invoice, groupBy: mocks.invoiceGroup }, payment: { count: mocks.payment, groupBy: mocks.paymentGroup } } }));
vi.mock('@/lib/api', () => ({ withCompanyAuth: (_roles: unknown, handler: Function) => (request: Request) => handler(request, {}, { companyId: 'company-trusted' }) }));
import { GET } from '../route';

describe('dashboard tenant summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.customer.mockResolvedValue(1); mocks.catalogItem.mockResolvedValue(2); mocks.quotation.mockResolvedValue(10); mocks.salesOrder.mockResolvedValue(4); mocks.contract.mockResolvedValue(5); mocks.invoice.mockResolvedValueOnce(6).mockResolvedValueOnce(2); mocks.payment.mockResolvedValue(7);
    mocks.quotationGroup.mockResolvedValue([]); mocks.contractGroup.mockResolvedValue([]); mocks.invoiceGroup.mockResolvedValue([]); mocks.paymentGroup.mockResolvedValue([]);
  });
  it('reconciles dashboard counts to list semantics using the trusted tenant', async () => {
    const response = await GET(new Request('http://localhost/api/dashboard/summary?companyId=attacker'));
    expect(await response.json()).toEqual({ data: { customers: 1, catalogItems: 2, quotations: 10, salesOrders: 4, contracts: 5, invoices: 6, outstandingInvoices: 2, payments: 7 } });
    expect(mocks.quotation).toHaveBeenCalledWith({ where: { companyId: 'company-trusted', isDeleted: false, isCurrentRevision: true } });
    expect(mocks.invoice).toHaveBeenNthCalledWith(1, { where: { companyId: 'company-trusted' } });
    expect(mocks.invoice).toHaveBeenNthCalledWith(2, { where: { companyId: 'company-trusted', status: 'ISSUED', settlementStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } } });
  });
});
