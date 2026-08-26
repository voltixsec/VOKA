import { apiSuccess, withCompanyAuth } from '@/lib/api';
import { prisma } from '@/lib/prisma';

function money(value: unknown) {
  return String(value ?? '0');
}

export const GET = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES', 'VIEWER'],
  async (_request, _auth, company) => {
    const companyId = company.companyId;
    const [quotationStatus, quotationCurrency, contractStatus, contractCurrency, invoiceStatus, invoiceCurrency, paymentCurrency] = await Promise.all([
      prisma.quotation.groupBy({ by: ['status'], where: { companyId, isDeleted: false, isCurrentRevision: true }, _count: { _all: true } }),
      prisma.quotation.groupBy({ by: ['currencyCode'], where: { companyId, isDeleted: false, isCurrentRevision: true }, _count: { _all: true }, _sum: { totalAmount: true } }),
      prisma.contract.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
      prisma.contract.groupBy({ by: ['currencyCode'], where: { companyId }, _count: { _all: true }, _sum: { totalAmount: true } }),
      prisma.invoice.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
      prisma.invoice.groupBy({ by: ['currencyCode'], where: { companyId }, _count: { _all: true }, _sum: { totalAmount: true, paidAmount: true, outstandingAmount: true } }),
      prisma.payment.groupBy({ by: ['currencyCode'], where: { companyId }, _count: { _all: true }, _sum: { amount: true } }),
    ]);

    return apiSuccess({
      quotations: {
        totalCount: quotationStatus.reduce((sum, row) => sum + row._count._all, 0),
        byStatus: Object.fromEntries(quotationStatus.map((row) => [row.status, row._count._all])),
        byCurrency: quotationCurrency.map((row) => ({ currencyCode: row.currencyCode, count: row._count._all, totalAmount: money(row._sum.totalAmount) })),
      },
      contracts: {
        totalCount: contractStatus.reduce((sum, row) => sum + row._count._all, 0),
        byStatus: Object.fromEntries(contractStatus.map((row) => [row.status, row._count._all])),
        byCurrency: contractCurrency.map((row) => ({ currencyCode: row.currencyCode, count: row._count._all, totalAmount: money(row._sum.totalAmount) })),
      },
      invoices: {
        totalCount: invoiceStatus.reduce((sum, row) => sum + row._count._all, 0),
        byStatus: Object.fromEntries(invoiceStatus.map((row) => [row.status, row._count._all])),
        byCurrency: invoiceCurrency.map((row) => ({ currencyCode: row.currencyCode, count: row._count._all, totalAmount: money(row._sum.totalAmount), paidAmount: money(row._sum.paidAmount), outstandingAmount: money(row._sum.outstandingAmount) })),
      },
      payments: {
        totalCount: paymentCurrency.reduce((sum, row) => sum + row._count._all, 0),
        byCurrency: paymentCurrency.map((row) => ({ currencyCode: row.currencyCode, count: row._count._all, collectedAmount: money(row._sum.amount) })),
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  },
);
