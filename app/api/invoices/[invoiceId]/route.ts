import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { GetInvoiceUseCase } from "@/src/application/invoice";
import { PrismaInvoiceRepository } from "@/src/infrastructure/persistence/prisma/invoice/PrismaInvoiceRepository";
import { serializeInvoice } from "../serialize-invoice";

const repository = new PrismaInvoiceRepository(prisma);
const getInvoice = new GetInvoiceUseCase(repository);
function id(request: Request) { const parts = new URL(request.url).pathname.split("/").filter(Boolean); const value = parts.at(-1); if (!value || value === "invoices") throw ApiError.badRequest("INVOICE_ID_REQUIRED", "invoiceId is required."); return decodeURIComponent(value); }
export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, _auth, company) => {
  const invoice = await getInvoice.execute(company.companyId, id(request));
  if (!invoice) throw ApiError.notFound("INVOICE_NOT_FOUND", "Invoice not found.");
  return apiSuccess(serializeInvoice(invoice), { headers: { "Cache-Control": "no-store" } });
});
