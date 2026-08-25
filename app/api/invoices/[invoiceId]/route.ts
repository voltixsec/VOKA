import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { GetInvoiceUseCase, UpdateDraftInvoiceUseCase } from "@/src/application/invoice";
import { InvoiceDomainError } from "@/src/domain/invoice";
import { PrismaInvoiceRepository } from "@/src/infrastructure/persistence/prisma/invoice/PrismaInvoiceRepository";
import { serializeInvoice } from "../serialize-invoice";

const repository = new PrismaInvoiceRepository(prisma);
const getInvoice = new GetInvoiceUseCase(repository);
const updateInvoice = new UpdateDraftInvoiceUseCase(repository);
function id(request: Request) { const parts = new URL(request.url).pathname.split("/").filter(Boolean); const value = parts.at(-1); if (!value || value === "invoices") throw ApiError.badRequest("INVOICE_ID_REQUIRED", "invoiceId is required."); return decodeURIComponent(value); }
export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const invoice = await getInvoice.execute(company.companyId, id(request));
  if (!invoice) throw ApiError.notFound("INVOICE_NOT_FOUND", "Invoice not found.");
  return apiSuccess(serializeInvoice(invoice), { headers: { "Cache-Control": "no-store" } });
});

export const PUT = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;
  const invoiceDate = typeof body.invoiceDate === "string" ? new Date(body.invoiceDate) : null;
  const dueDate = typeof body.dueDate === "string" && body.dueDate ? new Date(body.dueDate) : null;
  if (!expectedUpdatedAt || Number.isNaN(expectedUpdatedAt.getTime())) throw ApiError.badRequest("INVOICE_VERSION_REQUIRED", "A valid expectedUpdatedAt value is required.");
  if (!invoiceDate || Number.isNaN(invoiceDate.getTime()) || (dueDate && Number.isNaN(dueDate.getTime()))) throw ApiError.badRequest("INVALID_INVOICE_DATE", "Invoice dates are invalid.");
  if (body.lines !== undefined && (!Array.isArray(body.lines) || body.lines.length === 0)) throw ApiError.badRequest("INVOICE_LINES_REQUIRED", "At least one invoice line is required.");
  try {
    const invoice = await updateInvoice.execute({
      companyId: company.companyId,
      invoiceId: id(request),
      expectedUpdatedAt,
      customerId: typeof body.customerId === "string" ? body.customerId.trim() || undefined : undefined,
      priceListId: typeof body.priceListId === "string" ? body.priceListId.trim() || null : undefined,
      currencyCode: typeof body.currencyCode === "string" ? body.currencyCode : undefined,
      invoiceDate,
      dueDate,
      lines: Array.isArray(body.lines) ? body.lines : undefined,
      discount: body.discount ?? null,
      notes: typeof body.notes === "string" ? body.notes : null,
      termsAndConditions: typeof body.termsAndConditions === "string" ? body.termsAndConditions : null,
      actor: { userId: auth?.user?.id ?? null, name: auth?.user?.name || auth?.user?.email || company.role, role: company.role },
    });
    if (!invoice) throw ApiError.notFound("INVOICE_NOT_FOUND", "Invoice not found.");
    return apiSuccess(serializeInvoice(invoice), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvoiceDomainError) {
      if (error.message.includes("changed since")) throw ApiError.conflict("INVOICE_EDIT_CONFLICT", error.message);
      throw ApiError.badRequest("INVOICE_DOMAIN_ERROR", error.message);
    }
    throw error;
  }
});
