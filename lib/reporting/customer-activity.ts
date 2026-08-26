import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export type CustomerActivityProjection = 'SCREEN' | 'EXPORT';

const SCREEN_LIMIT = 8;
const EXPORT_LIMIT = 500;
const number = (value: unknown) => Number(value ?? 0);
const iso = (value: Date) => value.toISOString();
const nullableIso = (value: Date | null) => value?.toISOString() ?? null;
const moneyGroups = (
  rows: Array<{ currencyCode: string; _sum: Record<string, unknown>; _count: { _all: number } }>,
  fields: string[],
) => rows.map((row) => ({
  currencyCode: row.currencyCode,
  count: row._count._all,
  ...Object.fromEntries(fields.map((field) => [field, number(row._sum[field])])),
}));

export async function getCustomerActivitySnapshot(
  companyId: string,
  customerId: string,
  projection: CustomerActivityProjection = 'SCREEN',
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId, isDeleted: false },
    select: { id: true, code: true, name: true, nameAr: true, nameEn: true },
  });
  if (!customer) throw ApiError.notFound('CUSTOMER_NOT_FOUND', 'Customer not found.');

  const tenant = { companyId, customerId };
  const limit = projection === 'EXPORT' ? EXPORT_LIMIT + 1 : SCREEN_LIMIT;
  const [quotationTotals, quotationStatuses, quotations, salesOrderTotals, salesOrders, contractTotals, contracts, invoiceTotals, invoiceStatuses, invoices, paymentTotals, payments] = await Promise.all([
    prisma.quotation.groupBy({ by: ['currencyCode'], where: { ...tenant, isCurrentRevision: true, isDeleted: false }, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.quotation.groupBy({ by: ['status'], where: { ...tenant, isCurrentRevision: true, isDeleted: false }, _count: { _all: true } }),
    prisma.quotation.findMany({ where: { ...tenant, isCurrentRevision: true, isDeleted: false }, select: { id: true, number: true, familyId: true, revisionNumber: true, previousRevisionId: true, status: true, currencyCode: true, totalAmount: true, issueDate: true, expiryDate: true }, orderBy: { issueDate: 'desc' }, take: limit }),
    prisma.salesOrder.groupBy({ by: ['currencyCode'], where: tenant, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.salesOrder.findMany({ where: tenant, select: { id: true, number: true, status: true, currencyCode: true, totalAmount: true, orderDate: true, sourceQuotationId: true, sourceQuotationNumber: true, sourceQuotationFamilyId: true, sourceQuotationRevisionNumber: true }, orderBy: { orderDate: 'desc' }, take: limit }),
    prisma.contract.groupBy({ by: ['currencyCode'], where: tenant, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.contract.findMany({ where: tenant, select: { id: true, number: true, status: true, origin: true, sourceKind: true, sourceId: true, currencyCode: true, totalAmount: true, contractDate: true, startDate: true, endDate: true }, orderBy: { contractDate: 'desc' }, take: limit }),
    prisma.invoice.groupBy({ by: ['currencyCode'], where: tenant, _count: { _all: true }, _sum: { totalAmount: true, paidAmount: true, outstandingAmount: true } }),
    prisma.invoice.groupBy({ by: ['status'], where: tenant, _count: { _all: true } }),
    prisma.invoice.findMany({ where: tenant, select: { id: true, number: true, status: true, settlementStatus: true, origin: true, sourceKind: true, sourceId: true, sourceQuotationFamilyId: true, sourceQuotationRevisionNumber: true, currencyCode: true, totalAmount: true, paidAmount: true, outstandingAmount: true, invoiceDate: true, dueDate: true }, orderBy: { invoiceDate: 'desc' }, take: limit }),
    prisma.payment.groupBy({ by: ['currencyCode'], where: { companyId, invoice: { customerId } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.payment.findMany({ where: { companyId, invoice: { customerId } }, select: { id: true, amount: true, currencyCode: true, method: true, receivedAt: true, reference: true, invoice: { select: { id: true, number: true } } }, orderBy: { receivedAt: 'desc' }, take: limit }),
  ]);

  if (projection === 'EXPORT' && [quotations, salesOrders, contracts, invoices, payments].some((rows) => rows.length > EXPORT_LIMIT)) {
    throw ApiError.badRequest('CUSTOMER_ACTIVITY_TOO_LARGE', `Customer Activity exceeds ${EXPORT_LIMIT} rows in at least one module.`);
  }

  return {
    customer,
    projection,
    generatedAt: new Date().toISOString(),
    quotations: { totals: moneyGroups(quotationTotals as never, ['totalAmount']), statuses: Object.fromEntries(quotationStatuses.map((row) => [row.status, row._count._all])), records: quotations.slice(0, projection === 'EXPORT' ? EXPORT_LIMIT : SCREEN_LIMIT).map((row) => ({ ...row, issueDate: iso(row.issueDate), expiryDate: nullableIso(row.expiryDate), totalAmount: number(row.totalAmount) })) },
    salesOrders: { totals: moneyGroups(salesOrderTotals as never, ['totalAmount']), records: salesOrders.slice(0, projection === 'EXPORT' ? EXPORT_LIMIT : SCREEN_LIMIT).map((row) => ({ ...row, orderDate: iso(row.orderDate), totalAmount: number(row.totalAmount) })) },
    contracts: { totals: moneyGroups(contractTotals as never, ['totalAmount']), records: contracts.slice(0, projection === 'EXPORT' ? EXPORT_LIMIT : SCREEN_LIMIT).map((row) => ({ ...row, contractDate: iso(row.contractDate), startDate: nullableIso(row.startDate), endDate: nullableIso(row.endDate), totalAmount: number(row.totalAmount) })) },
    invoices: { totals: moneyGroups(invoiceTotals as never, ['totalAmount', 'paidAmount', 'outstandingAmount']), statuses: Object.fromEntries(invoiceStatuses.map((row) => [row.status, row._count._all])), records: invoices.slice(0, projection === 'EXPORT' ? EXPORT_LIMIT : SCREEN_LIMIT).map((row) => ({ ...row, invoiceDate: iso(row.invoiceDate), dueDate: nullableIso(row.dueDate), totalAmount: number(row.totalAmount), paidAmount: number(row.paidAmount), outstandingAmount: number(row.outstandingAmount) })) },
    payments: { totals: moneyGroups(paymentTotals as never, ['amount']), records: payments.slice(0, projection === 'EXPORT' ? EXPORT_LIMIT : SCREEN_LIMIT).map((row) => ({ ...row, receivedAt: iso(row.receivedAt), amount: number(row.amount) })) },
  };
}
