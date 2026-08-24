import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { CreateInvoiceUseCase, ListInvoicesUseCase } from "@/src/application/invoice";
import { InvoiceDomainError } from "@/src/domain/invoice";
import { PrismaInvoiceRepository } from "@/src/infrastructure/persistence/prisma/invoice/PrismaInvoiceRepository";
import { serializeInvoice } from "./serialize-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const repository = new PrismaInvoiceRepository(prisma);
const createInvoice = new CreateInvoiceUseCase(repository);
const listInvoices = new ListInvoicesUseCase(repository);
const statuses = new Set(["DRAFT", "ISSUED", "VOID"]);
const settlements = new Set(["UNPAID", "PARTIALLY_PAID", "PAID"]);

function positive(value: string | null, fallback: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw ApiError.badRequest("INVALID_PAGINATION", "Pagination must be positive integers.");
  return parsed;
}
function actor(auth: any, company: any) {
  return { userId: auth?.user?.id ?? null, name: auth?.user?.name || auth?.user?.email || company.role, role: company.role };
}

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const query = new URL(request.url).searchParams;
  const status = query.get("status") || undefined;
  const settlementStatus = query.get("settlementStatus") || undefined;
  if (status && !statuses.has(status)) throw ApiError.badRequest("INVALID_INVOICE_STATUS", "Invoice status is invalid.");
  if (settlementStatus && !settlements.has(settlementStatus)) throw ApiError.badRequest("INVALID_SETTLEMENT_STATUS", "Settlement status is invalid.");
  const page = positive(query.get("page"), 1);
  const take = Math.min(100, positive(query.get("pageSize"), 20));
  const result = await listInvoices.execute({
    companyId: company.companyId, customerId: query.get("customerId") || undefined,
    status, settlementStatus, search: query.get("search") || undefined,
    skip: (page - 1) * take, take,
  });
  return apiSuccess({ invoices: result.invoices.map(serializeInvoice), pagination: { total: result.total, page, pageSize: take, totalPages: Math.ceil(result.total / take) } }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const requestKey = request.headers.get("Idempotency-Key")?.trim() || "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(requestKey)) throw ApiError.badRequest("INVOICE_IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required.");
  const sourceKind = body.sourceKind === "QUOTATION" || body.sourceKind === "SALES_ORDER" ? body.sourceKind : undefined;
  if (body.sourceKind && !sourceKind) throw ApiError.badRequest("INVALID_INVOICE_SOURCE", "Only eligible Quotation or Sales Order sources are supported.");
  if (sourceKind && (typeof body.sourceId !== "string" || !body.sourceId.trim())) throw ApiError.badRequest("INVOICE_SOURCE_REQUIRED", "sourceId is required.");
  if (!sourceKind && (typeof body.customerId !== "string" || !body.customerId.trim())) throw ApiError.badRequest("CUSTOMER_ID_REQUIRED", "customerId is required.");
  if (!sourceKind && (!Array.isArray(body.lines) || body.lines.length === 0)) throw ApiError.badRequest("INVOICE_LINES_REQUIRED", "At least one invoice line is required.");
  const invoiceDate = typeof body.invoiceDate === "string" ? new Date(body.invoiceDate) : undefined;
  const dueDate = typeof body.dueDate === "string" && body.dueDate ? new Date(body.dueDate) : null;
  if ((invoiceDate && Number.isNaN(invoiceDate.getTime())) || (dueDate && Number.isNaN(dueDate.getTime()))) throw ApiError.badRequest("INVALID_INVOICE_DATE", "Invoice dates are invalid.");
  try {
    const invoice = await createInvoice.execute({
      companyId: company.companyId, requestKey, customerId: typeof body.customerId === "string" ? body.customerId.trim() : undefined,
      priceListId: typeof body.priceListId === "string" ? body.priceListId.trim() || null : null,
      currencyCode: typeof body.currencyCode === "string" ? body.currencyCode : undefined,
      invoiceDate, dueDate,
      lines: Array.isArray(body.lines) ? body.lines : undefined, discount: body.discount ?? null,
      notes: typeof body.notes === "string" ? body.notes : null,
      termsAndConditions: typeof body.termsAndConditions === "string" ? body.termsAndConditions : null,
      sourceKind, sourceId: sourceKind ? body.sourceId.trim() : undefined,
      actor: actor(auth, company),
    });
    return apiSuccess(serializeInvoice(invoice), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvoiceDomainError || (error as any)?.name === "QuotationDomainError") throw ApiError.badRequest("INVOICE_DOMAIN_ERROR", (error as Error).message);
    throw error;
  }
});
