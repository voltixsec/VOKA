import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const query = new URL(request.url).searchParams; const page = Number(query.get("page") ?? 1), pageSize = Number(query.get("pageSize") ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw ApiError.badRequest("INVALID_PAGINATION", "Pagination must use positive integers and pageSize cannot exceed 100.");
  const where = { companyId: company.companyId }; const [payments, total] = await prisma.$transaction([prisma.payment.findMany({ where, include: { invoice: { select: { id: true, number: true, customerName: true, currencyCode: true, totalAmount: true, outstandingAmount: true } } }, orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }), prisma.payment.count({ where })]);
  return apiSuccess({ payments: payments.map((payment) => ({ ...payment, amount: String(payment.amount), receivedAt: payment.receivedAt.toISOString(), createdAt: payment.createdAt.toISOString(), invoice: { ...payment.invoice, totalAmount: String(payment.invoice.totalAmount), outstandingAmount: String(payment.invoice.outstandingAmount) } })), pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } }, { headers: { "Cache-Control": "private, no-store" } });
});
