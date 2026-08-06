import { ApiError, withCompanyAuth } from "@/lib/api";
import { GenerateQuotationDocumentUseCase, type DocumentLocale } from "@/src/application/document";
import { PdfKitQuotationDocumentRenderer } from "@/src/infrastructure/document/pdfkit/PdfKitQuotationDocumentRenderer";
import { PrismaQuotationRepository } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const generateDocument = new GenerateQuotationDocumentUseCase(new PrismaQuotationRepository(), new PdfKitQuotationDocumentRenderer());

function getQuotationId(request: Request): string {
  const quotationId = new URL(request.url).pathname.split("/").filter(Boolean).at(-2);
  if (!quotationId || quotationId === "quotations") throw ApiError.badRequest("QUOTATION_ID_REQUIRED", "quotationId is required.");
  return decodeURIComponent(quotationId);
}
function getLocale(request: Request, userLocale: string): DocumentLocale {
  const requested = new URL(request.url).searchParams.get("locale")?.toLowerCase();
  if (requested && requested !== "ar" && requested !== "en") throw ApiError.badRequest("DOCUMENT_LOCALE_INVALID", "locale must be ar or en.");
  return requested === "ar" || (!requested && userLocale.toLowerCase().startsWith("ar")) ? "ar" : "en";
}

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const result = await generateDocument.execute({ companyId: company.companyId, companyName: company.membership.company.name ?? "VOKA", quotationId: getQuotationId(request), locale: getLocale(request, auth.user.locale) });
  if (!result.success) throw ApiError.notFound(result.error.code, result.error.message);
  return new NextResponse(Buffer.from(result.data.bytes), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${result.data.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});
