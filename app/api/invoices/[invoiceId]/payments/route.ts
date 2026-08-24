import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { RecordPaymentUseCase } from "@/src/application/invoice";
import { InvoiceDomainError, type PaymentMethod } from "@/src/domain/invoice";
import { PrismaInvoiceRepository } from "@/src/infrastructure/persistence/prisma/invoice/PrismaInvoiceRepository";
import { serializeInvoice } from "../../serialize-invoice";
const repository = new PrismaInvoiceRepository(prisma);
const recordPayment = new RecordPaymentUseCase(repository);
const methods = new Set<PaymentMethod>(["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"]);
function id(request: Request) { const p = new URL(request.url).pathname.split("/").filter(Boolean); return decodeURIComponent(p[p.length - 2] || ""); }
const serializePayment = (payment: any) => ({ ...payment, receivedAt: payment.receivedAt.toISOString(), createdAt: payment.createdAt.toISOString() });

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const query = new URL(request.url).searchParams;
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 50);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw ApiError.badRequest("INVALID_PAGINATION", "Pagination must use positive integers and pageSize cannot exceed 100.");
  const result = await repository.listPayments(company.companyId, id(request), (page - 1) * pageSize, pageSize);
  if (!result) throw ApiError.notFound("INVOICE_NOT_FOUND", "Invoice not found.");
  return apiSuccess({ payments: result.payments.map(serializePayment), pagination: { total: result.total, page, pageSize, totalPages: Math.ceil(result.total / pageSize) } }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const requestKey = request.headers.get("Idempotency-Key")?.trim() || "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(requestKey)) throw ApiError.badRequest("PAYMENT_IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required.");
  if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) throw ApiError.badRequest("INVALID_PAYMENT_AMOUNT", "Payment amount must be numeric.");
  if (typeof body.method !== "string" || !methods.has(body.method as PaymentMethod)) throw ApiError.badRequest("INVALID_PAYMENT_METHOD", "Payment method is invalid.");
  const receivedAt = typeof body.receivedAt === "string" ? new Date(body.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) throw ApiError.badRequest("INVALID_PAYMENT_DATE", "Payment date is invalid.");
  try {
    const result = await recordPayment.execute({
      companyId: company.companyId, invoiceId: id(request), requestKey,
      amount: body.amount, method: body.method as PaymentMethod, receivedAt,
      reference: typeof body.reference === "string" ? body.reference : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      actor: { userId: auth?.user?.id ?? null, name: auth?.user?.name || auth?.user?.email || company.role, role: company.role },
    });
    return apiSuccess({ invoice: serializeInvoice(result.invoice), payment: serializePayment(result.payment), created: result.created }, { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (error instanceof InvoiceDomainError) throw ApiError.conflict("PAYMENT_CONFLICT", error.message); throw error; }
});
