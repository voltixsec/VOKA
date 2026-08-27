import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { IssueInvoiceUseCase } from "@/src/application/invoice";
import { InvoiceDomainError } from "@/src/domain/invoice";
import { PrismaInvoiceRepository } from "@/src/infrastructure/persistence/prisma/invoice/PrismaInvoiceRepository";
import { serializeInvoice } from "../../serialize-invoice";
import { createNotification } from "@/lib/notifications/notification-service";
const useCase = new IssueInvoiceUseCase(new PrismaInvoiceRepository(prisma));
function id(request: Request) { const p = new URL(request.url).pathname.split("/").filter(Boolean); return decodeURIComponent(p[p.length - 2] || ""); }
export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request, auth, company) => {
  try {
    const invoiceId = id(request);
    const invoice = await useCase.execute(company.companyId, invoiceId, { userId: auth?.user?.id ?? null, name: auth?.user?.name || auth?.user?.email || company.role, role: company.role });
    if (!invoice) throw ApiError.notFound("INVOICE_NOT_FOUND", "Invoice not found.");
    const serialized = serializeInvoice(invoice);
    await createNotification(prisma, {
      companyId: company.companyId,
      type: "INVOICE_ISSUED",
      titleAr: "تم إصدار فاتورة",
      titleEn: "Invoice issued",
      messageAr: `تم إصدار الفاتورة ${serialized.number}.`,
      messageEn: `Invoice ${serialized.number} was issued.`,
      href: `/dashboard/invoices/${encodeURIComponent(invoiceId)}`,
      entityType: "INVOICE",
      entityId: invoiceId,
      dedupeKey: `invoice-issued:${invoiceId}`,
    });
    return apiSuccess(serialized, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (error instanceof InvoiceDomainError) throw ApiError.conflict("INVOICE_STATE_CONFLICT", error.message); throw error; }
});
