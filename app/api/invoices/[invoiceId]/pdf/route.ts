import { NextResponse } from "next/server";
import { ApiError, withCompanyAuth } from "@/lib/api";
import { localizeCompanyDocumentIdentity } from "@/lib/documents/company-document-identity";
import { renderCommercialPdf } from "@/lib/documents/commercial-pdf";
import { getInvoiceDocumentSnapshot, invoiceIdFromDocumentRequest } from "@/lib/documents/invoice-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function language(request: Request, fallback: string): "ar" | "en" {
  const v = new URL(request.url).searchParams.get("locale");
  if (v && v !== "ar" && v !== "en") throw ApiError.badRequest("DOCUMENT_LOCALE_INVALID", "locale must be ar or en.");
  return v === "ar" || (!v && fallback.startsWith("ar")) ? "ar" : "en";
}

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const row = await getInvoiceDocumentSnapshot(company.companyId, invoiceIdFromDocumentRequest(request, "pdf"));
  const locale = language(request, auth.user.locale);
  const ar = locale === "ar";
  const identity = localizeCompanyDocumentIdentity(row.company, locale, row.company?.name ?? "VOKA");
  const bytes = await renderCommercialPdf({
    kind: "INVOICE",
    locale,
    identity,
    number: row.number,
    status: row.status,
    settlementStatus: row.settlementStatus,
    customerName: ar ? row.customerNameAr ?? row.customerName : row.customerNameEn ?? row.customerName,
    dateLabel: ar ? "تاريخ الفاتورة" : "Invoice date",
    dateValue: row.invoiceDate.toISOString().slice(0, 10),
    dueLabel: ar ? "الاستحقاق" : "Due",
    dueValue: row.dueDate?.toISOString().slice(0, 10) ?? "—",
    currencyCode: row.currencyCode,
    provenance: [row.origin, row.sourceKind, row.sourceId].filter(Boolean).join(" / ") || null,
    lines: row.lines.map((line: { position: number; itemName: string; itemNameAr?: string | null; itemNameEn?: string | null; quantity: unknown; unitPrice: unknown; totalAmount: unknown }) => ({
      position: line.position,
      name: ar ? line.itemNameAr ?? line.itemName : line.itemNameEn ?? line.itemName,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      total: Number(line.totalAmount),
    })),
    subtotal: Number(row.subtotal),
    discountAmount: Number(row.discountAmount),
    taxAmount: Number(row.taxAmount),
    totalAmount: Number(row.totalAmount),
    paidAmount: Number(row.paidAmount),
    outstandingAmount: Number(row.outstandingAmount),
    notes: row.notes,
  });
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${row.number.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
