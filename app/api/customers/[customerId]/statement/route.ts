import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const MAX_ENTRIES = 500;
const MONEY = /^-?\d+(?:\.\d{1,3})?$/;
function mills(value: unknown): bigint {
  const text = String(value ?? "0"); if (!MONEY.test(text)) throw new Error("Invalid persisted monetary value.");
  const [whole, fraction = ""] = text.split("."); const negative = whole.startsWith("-"); const magnitude = BigInt(negative ? whole.slice(1) : whole) * 1000n + BigInt(fraction.padEnd(3, "0")); return negative ? -magnitude : magnitude;
}
function amount(value: bigint): string { const negative = value < 0n; const absolute = negative ? -value : value; return `${negative ? "-" : ""}${absolute / 1000n}.${String(absolute % 1000n).padStart(3, "0")}`; }
function date(value: string | null, fallback: Date, end = false): Date {
  if (!value) return fallback; if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw ApiError.badRequest("STATEMENT_DATE_INVALID", "Statement dates must use YYYY-MM-DD.");
  const parsed = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`); if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw ApiError.badRequest("STATEMENT_DATE_INVALID", "Statement date is invalid."); return parsed;
}

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const url = new URL(request.url); const parts = url.pathname.split("/").filter(Boolean); const customerId = decodeURIComponent(parts.at(-2) ?? "");
  if (!customerId) throw ApiError.badRequest("CUSTOMER_ID_REQUIRED", "customerId is required.");
  const currencyCode = (url.searchParams.get("currencyCode") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw ApiError.badRequest("STATEMENT_CURRENCY_REQUIRED", "A three-letter currencyCode is required.");
  const from = date(url.searchParams.get("from"), new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)));
  const to = date(url.searchParams.get("to"), new Date(), true);
  if (to < from || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw ApiError.badRequest("STATEMENT_RANGE_INVALID", "Statement range must be ordered and no longer than 366 days.");
  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId: company.companyId, isDeleted: false }, select: { id: true, code: true, name: true, nameAr: true, nameEn: true } });
  if (!customer) throw ApiError.notFound("CUSTOMER_NOT_FOUND", "Customer not found.");
  const invoiceWhere = { companyId: company.companyId, customerId, currencyCode, status: "ISSUED" as const };
  const paymentWhere = { companyId: company.companyId, currencyCode, invoice: { customerId, status: "ISSUED" as const } };
  const [openingInvoices, openingPayments, invoices, payments, outstanding] = await Promise.all([
    prisma.invoice.aggregate({ where: { ...invoiceWhere, invoiceDate: { lt: from } }, _sum: { totalAmount: true } }),
    prisma.payment.aggregate({ where: { ...paymentWhere, receivedAt: { lt: from } }, _sum: { amount: true } }),
    prisma.invoice.findMany({ where: { ...invoiceWhere, invoiceDate: { gte: from, lte: to } }, select: { id: true, number: true, invoiceDate: true, totalAmount: true }, orderBy: [{ invoiceDate: "asc" }, { number: "asc" }], take: MAX_ENTRIES + 1 }),
    prisma.payment.findMany({ where: { ...paymentWhere, receivedAt: { gte: from, lte: to } }, select: { id: true, amount: true, receivedAt: true, reference: true, invoice: { select: { number: true } } }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take: MAX_ENTRIES + 1 }),
    prisma.invoice.aggregate({ where: invoiceWhere, _sum: { outstandingAmount: true } }),
  ]);
  if (invoices.length + payments.length > MAX_ENTRIES) throw ApiError.badRequest("STATEMENT_TOO_LARGE", `Statement exceeds ${MAX_ENTRIES} entries; narrow the date range.`);
  let running = mills(openingInvoices._sum.totalAmount) - mills(openingPayments._sum.amount);
  const entries = [
    ...invoices.map((item) => ({ id: `invoice:${item.id}`, kind: "INVOICE" as const, date: item.invoiceDate, reference: item.number, debit: mills(item.totalAmount), credit: 0n })),
    ...payments.map((item) => ({ id: `payment:${item.id}`, kind: "PAYMENT" as const, date: item.receivedAt, reference: item.reference?.trim() || item.invoice.number, debit: 0n, credit: mills(item.amount) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "INVOICE" ? -1 : 1)).map((entry) => { running += entry.debit - entry.credit; return { id: entry.id, kind: entry.kind, date: entry.date.toISOString(), reference: entry.reference, debit: amount(entry.debit), credit: amount(entry.credit), runningBalance: amount(running) }; });
  return apiSuccess({ customer, currencyCode, from: from.toISOString(), to: to.toISOString(), openingBalance: amount(mills(openingInvoices._sum.totalAmount) - mills(openingPayments._sum.amount)), entries, closingBalance: amount(running), outstandingBalance: amount(mills(outstanding._sum.outstandingAmount)) }, { headers: { "Cache-Control": "private, no-store" } });
});
