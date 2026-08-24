import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { VoidInvoiceUseCase } from "@/src/application/invoice";
import { InvoiceDomainError } from "@/src/domain/invoice";
import { PrismaInvoiceRepository } from "@/src/infrastructure/persistence/prisma/invoice/PrismaInvoiceRepository";
import { serializeInvoice } from "../../serialize-invoice";
const useCase = new VoidInvoiceUseCase(new PrismaInvoiceRepository(prisma));
function id(request: Request) { const p = new URL(request.url).pathname.split("/").filter(Boolean); return decodeURIComponent(p[p.length - 2] || ""); }
export const POST = withCompanyAuth(["OWNER", "ADMIN"], async (request, auth, company) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.reason !== "string" || !body.reason.trim()) throw ApiError.badRequest("VOID_REASON_REQUIRED", "Void reason is required.");
  try {
    const invoice = await useCase.execute(company.companyId, id(request), { userId: auth?.user?.id ?? null, name: auth?.user?.name || auth?.user?.email || company.role, role: company.role }, body.reason);
    if (!invoice) throw ApiError.notFound("INVOICE_NOT_FOUND", "Invoice not found.");
    return apiSuccess(serializeInvoice(invoice), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (error instanceof InvoiceDomainError) throw ApiError.conflict("INVOICE_STATE_CONFLICT", error.message); throw error; }
});
