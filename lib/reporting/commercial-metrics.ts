import type { PrismaClient } from '../generated/prisma/client';

const currentQuotationWhere = (companyId: string) => ({ companyId, isDeleted: false, isCurrentRevision: true });
const money = (value: unknown) => String(value ?? '0');

export async function getCommercialMetricsSnapshot(prisma: PrismaClient, companyId: string) {
  const [customers, catalogItems, quotations, salesOrders, contracts, invoices, outstandingInvoices, payments,
    quotationStatus, quotationCurrency, contractStatus, contractCurrency, invoiceStatus, invoiceCurrency, paymentCurrency] = await Promise.all([
    prisma.customer.count({ where: { companyId, isDeleted: false } }),
    prisma.catalogItem.count({ where: { companyId, isActive: true } }),
    prisma.quotation.count({ where: currentQuotationWhere(companyId) }),
    prisma.salesOrder.count({ where: { companyId } }),
    prisma.contract.count({ where: { companyId } }),
    prisma.invoice.count({ where: { companyId } }),
    prisma.invoice.count({ where: { companyId, status: 'ISSUED', settlementStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } } }),
    prisma.payment.count({ where: { companyId } }),
    prisma.quotation.groupBy({ by: ['status'], where: currentQuotationWhere(companyId), _count: { _all: true } }),
    prisma.quotation.groupBy({ by: ['currencyCode'], where: currentQuotationWhere(companyId), _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.contract.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
    prisma.contract.groupBy({ by: ['currencyCode'], where: { companyId }, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.invoice.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ['currencyCode'], where: { companyId }, _count: { _all: true }, _sum: { totalAmount: true, paidAmount: true, outstandingAmount: true } }),
    prisma.payment.groupBy({ by: ['currencyCode'], where: { companyId }, _count: { _all: true }, _sum: { amount: true } }),
  ]);

  return {
    counts: { customers, catalogItems, quotations, salesOrders, contracts, invoices, outstandingInvoices, payments },
    modules: {
      quotations: { totalCount: quotations, byStatus: Object.fromEntries(quotationStatus.map((row) => [row.status, row._count._all])), byCurrency: quotationCurrency.map((row) => ({ currencyCode: row.currencyCode, count: row._count._all, totalAmount: money(row._sum.totalAmount) })) },
      contracts: { totalCount: contracts, byStatus: Object.fromEntries(contractStatus.map((row) => [row.status, row._count._all])), byCurrency: contractCurrency.map((row) => ({ currencyCode: row.currencyCode, count: row._count._all, totalAmount: money(row._sum.totalAmount) })) },
      invoices: { totalCount: invoices, outstandingCount: outstandingInvoices, byStatus: Object.fromEntries(invoiceStatus.map((row) => [row.status, row._count._all])), byCurrency: invoiceCurrency.map((row) => ({ currencyCode: row.currencyCode, count: row._count._all, totalAmount: money(row._sum.totalAmount), paidAmount: money(row._sum.paidAmount), outstandingAmount: money(row._sum.outstandingAmount) })) },
      payments: { totalCount: payments, byCurrency: paymentCurrency.map((row) => ({ currencyCode: row.currencyCode, count: row._count._all, collectedAmount: money(row._sum.amount) })) },
    },
  };
}
