import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const number = (value: unknown) => Number(value ?? 0);
const moneyGroups = (rows: Array<{ currencyCode: string; _sum: Record<string, unknown>; _count: { _all: number } }>, fields: string[]) => rows.map((row) => ({ currencyCode: row.currencyCode, count: row._count._all, ...Object.fromEntries(fields.map((field) => [field, number(row._sum[field])])) }));
function id(request: Request) { const parts = new URL(request.url).pathname.split("/").filter(Boolean); const value = parts.at(-2); if (!value) throw ApiError.badRequest("CUSTOMER_ID_REQUIRED", "customerId is required."); return decodeURIComponent(value); }

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const customerId = id(request); const tenant = { companyId: company.companyId, customerId };
  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId: company.companyId, isDeleted: false }, select: { id: true } });
  if (!customer) throw ApiError.notFound("CUSTOMER_NOT_FOUND", "Customer not found.");
  const [quotationTotals, quotationStatuses, quotations, salesOrderTotals, salesOrders, contractTotals, contracts, invoiceTotals, invoiceStatuses, invoices, paymentTotals, payments] = await Promise.all([
    prisma.quotation.groupBy({ by: ["currencyCode"], where: { ...tenant, isCurrentRevision: true, isDeleted: false }, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.quotation.groupBy({ by: ["status"], where: { ...tenant, isCurrentRevision: true, isDeleted: false }, _count: { _all: true } }),
    prisma.quotation.findMany({ where: { ...tenant, isCurrentRevision: true, isDeleted: false }, select: { id: true, number: true, status: true, currencyCode: true, totalAmount: true, issueDate: true }, orderBy: { issueDate: "desc" }, take: 8 }),
    prisma.salesOrder.groupBy({ by: ["currencyCode"], where: tenant, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.salesOrder.findMany({ where: tenant, select: { id: true, number: true, status: true, currencyCode: true, totalAmount: true, orderDate: true }, orderBy: { orderDate: "desc" }, take: 8 }),
    prisma.contract.groupBy({ by: ["currencyCode"], where: tenant, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.contract.findMany({ where: tenant, select: { id: true, number: true, status: true, currencyCode: true, totalAmount: true, contractDate: true }, orderBy: { contractDate: "desc" }, take: 8 }),
    prisma.invoice.groupBy({ by: ["currencyCode"], where: tenant, _count: { _all: true }, _sum: { totalAmount: true, paidAmount: true, outstandingAmount: true } }),
    prisma.invoice.groupBy({ by: ["status"], where: tenant, _count: { _all: true } }),
    prisma.invoice.findMany({ where: tenant, select: { id: true, number: true, status: true, settlementStatus: true, currencyCode: true, totalAmount: true, outstandingAmount: true, invoiceDate: true }, orderBy: { invoiceDate: "desc" }, take: 8 }),
    prisma.payment.groupBy({ by: ["currencyCode"], where: { companyId: company.companyId, invoice: { customerId } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.payment.findMany({ where: { companyId: company.companyId, invoice: { customerId } }, select: { id: true, amount: true, currencyCode: true, method: true, receivedAt: true, invoice: { select: { id: true, number: true } } }, orderBy: { receivedAt: "desc" }, take: 8 }),
  ]);
  return apiSuccess({
    quotations: { totals: moneyGroups(quotationTotals as any, ["totalAmount"]), statuses: Object.fromEntries(quotationStatuses.map((row) => [row.status, row._count._all])), records: quotations.map((row) => ({ ...row, totalAmount: number(row.totalAmount) })) },
    salesOrders: { totals: moneyGroups(salesOrderTotals as any, ["totalAmount"]), records: salesOrders.map((row) => ({ ...row, totalAmount: number(row.totalAmount) })) },
    contracts: { totals: moneyGroups(contractTotals as any, ["totalAmount"]), records: contracts.map((row) => ({ ...row, totalAmount: number(row.totalAmount) })) },
    invoices: { totals: moneyGroups(invoiceTotals as any, ["totalAmount", "paidAmount", "outstandingAmount"]), statuses: Object.fromEntries(invoiceStatuses.map((row) => [row.status, row._count._all])), records: invoices.map((row) => ({ ...row, totalAmount: number(row.totalAmount), outstandingAmount: number(row.outstandingAmount) })) },
    payments: { totals: moneyGroups(paymentTotals as any, ["amount"]), records: payments.map((row) => ({ ...row, amount: number(row.amount) })) },
  }, { headers: { "Cache-Control": "private, no-store" } });
});
