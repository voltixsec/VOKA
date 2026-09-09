import { NextResponse } from "next/server";
import { ApiError, withCompanyAuth } from "@/lib/api";
import { localizeCompanyDocumentIdentity } from "@/lib/documents/company-document-identity";
import { commercialSnapshotFromParts, renderCommercialProposalPdf } from "@/lib/documents/commercial-pdf";
import { displayLabel } from "@/lib/i18n/display-labels";
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
  const settlement = displayLabel(row.settlementStatus, locale);
  const status = displayLabel(row.status, locale);
  const paidNote = ar
    ? `الحالة: ${status} · ${settlement}. المدفوع ${Number(row.paidAmount).toFixed(3)} ${row.currencyCode}. المتبقي ${Number(row.outstandingAmount).toFixed(3)} ${row.currencyCode}.`
    : `Status: ${status} · ${settlement}. Paid ${Number(row.paidAmount).toFixed(3)} ${row.currencyCode}. Outstanding ${Number(row.outstandingAmount).toFixed(3)} ${row.currencyCode}.`;
  const snapshot = commercialSnapshotFromParts({
    kind: "INVOICE",
    locale,
    company: {
      name: identity.name,
      address: identity.address,
      poBox: identity.poBox,
      phone: identity.phone,
      mobile: identity.mobile,
      whatsapp: identity.whatsapp,
      logoUrl: identity.logoUrl,
      letterheadUrl: identity.letterheadUrl,
      brandTheme: identity.brandTheme,
    },
    number: row.number,
    status: row.status,
    issueDate: row.invoiceDate,
    dueDate: row.dueDate,
    currencyCode: row.currencyCode,
    customerName: ar ? row.customerNameAr ?? row.customerName : row.customerNameEn ?? row.customerName,
    lines: row.lines.map((line: {
      position: number;
      type: string;
      itemCode?: string | null;
      itemName: string;
      itemNameAr?: string | null;
      itemNameEn?: string | null;
      description?: string | null;
      unitName?: string | null;
      quantity: unknown;
      unitPrice: unknown;
      discountAmount?: unknown;
      taxAmount?: unknown;
      totalAmount: unknown;
    }) => ({
      position: line.position,
      type: line.type,
      itemCode: line.itemCode ?? null,
      itemName: line.itemName,
      itemNameAr: line.itemNameAr ?? null,
      itemNameEn: line.itemNameEn ?? null,
      description: line.description ?? null,
      descriptionAr: null,
      descriptionEn: null,
      unitName: line.unitName ?? null,
      unitNameAr: null,
      unitNameEn: null,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      discountAmount: Number(line.discountAmount ?? 0),
      taxAmount: Number(line.taxAmount ?? 0),
      totalAmount: Number(line.totalAmount),
    })),
    discountType: row.discountType === "PERCENTAGE" || row.discountType === "FIXED" ? row.discountType : null,
    discountValue: Number(row.discountValue ?? 0),
    totals: {
      subtotal: Number(row.subtotal),
      discountAmount: Number(row.discountAmount),
      taxAmount: Number(row.taxAmount),
      totalAmount: Number(row.totalAmount),
    },
    notes: [row.notes, paidNote].filter(Boolean).join("\n"),
    terms: row.termsAndConditions,
  });
  const bytes = await renderCommercialProposalPdf(snapshot, "INVOICE");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${row.number.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
