import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const MAX_INVOICES = 1000; const DAY = 86_400_000; const MONEY = /^\d+(?:\.\d{1,3})?$/;
function mills(value: unknown): bigint { const text = String(value ?? "0"); if (!MONEY.test(text)) throw new Error("Invalid persisted monetary value."); const [whole, fraction = ""] = text.split("."); return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0")); }
function amount(value: bigint) { return `${value / 1000n}.${String(value % 1000n).padStart(3, "0")}`; }
function asOfDate(value: string | null) { const day = value ?? new Date().toISOString().slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw ApiError.badRequest("REPORT_DATE_INVALID", "asOf must use YYYY-MM-DD."); const parsed = new Date(`${day}T23:59:59.999Z`); if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) throw ApiError.badRequest("REPORT_DATE_INVALID", "asOf is invalid."); return parsed; }

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const query = new URL(request.url).searchParams; const currencyCode = (query.get("currencyCode") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw ApiError.badRequest("REPORT_CURRENCY_REQUIRED", "A three-letter currencyCode is required.");
  const asOf = asOfDate(query.get("asOf"));
  const rows = await prisma.invoice.findMany({ where: { companyId: company.companyId, currencyCode, status: "ISSUED", outstandingAmount: { gt: 0 } }, select: { id: true, number: true, invoiceDate: true, dueDate: true, outstandingAmount: true, customer: { select: { id: true, code: true, name: true, nameAr: true, nameEn: true } } }, orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }, { number: "asc" }], take: MAX_INVOICES + 1 });
  if (rows.length > MAX_INVOICES) throw ApiError.badRequest("REPORT_TOO_LARGE", `Receivables report exceeds ${MAX_INVOICES} invoices; use a narrower operational scope.`);
  const totals = { CURRENT: 0n, DAYS_0_30: 0n, DAYS_31_60: 0n, DAYS_61_90: 0n, DAYS_90_PLUS: 0n };
  const invoices = rows.map((row) => { const basis = row.dueDate ?? row.invoiceDate; const overdueDays = Math.max(0, Math.floor((asOf.getTime() - new Date(Date.UTC(basis.getUTCFullYear(), basis.getUTCMonth(), basis.getUTCDate(), 23, 59, 59, 999)).getTime()) / DAY)); const bucket = basis > asOf ? "CURRENT" : overdueDays <= 30 ? "DAYS_0_30" : overdueDays <= 60 ? "DAYS_31_60" : overdueDays <= 90 ? "DAYS_61_90" : "DAYS_90_PLUS"; const value = mills(row.outstandingAmount); totals[bucket] += value; return { id: row.id, number: row.number, invoiceDate: row.invoiceDate.toISOString(), dueDate: row.dueDate?.toISOString() ?? null, overdueDays, bucket, outstandingAmount: amount(value), customer: row.customer }; });
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0n);
  return apiSuccess({ asOf: asOf.toISOString(), currencyCode, invoiceCount: invoices.length, totalOutstanding: amount(total), buckets: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, amount(value)])), invoices }, { headers: { "Cache-Control": "private, no-store" } });
});
