import path from "node:path";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { ApiError, withCompanyAuth } from "@/lib/api";
import {
  drawCompanyDocumentIdentity,
  localizeCompanyDocumentIdentity,
} from "@/lib/documents/company-document-identity";
import { getInvoiceDocumentSnapshot, invoiceIdFromDocumentRequest } from "@/lib/documents/invoice-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function language(request: Request, fallback: string): "ar" | "en" {
  const v = new URL(request.url).searchParams.get("locale");
  if (v && v !== "ar" && v !== "en") throw ApiError.badRequest("DOCUMENT_LOCALE_INVALID", "locale must be ar or en.");
  return v === "ar" || (!v && fallback.startsWith("ar")) ? "ar" : "en";
}

async function pdf(row: Awaited<ReturnType<typeof getInvoiceDocumentSnapshot>>, locale: "ar" | "en") {
  const identity = localizeCompanyDocumentIdentity(row.company, locale, row.company?.name ?? "VOKA");
  const doc = new PDFDocument({ size: "A4", margin: 42, info: { Title: row.number, Author: identity.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (x) => chunks.push(Buffer.from(x)));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("VOKA", path.join(process.cwd(), "assets", "fonts", "Cairo-Variable.ttf")).font("VOKA");
  const ar = locale === "ar";
  const t = (a: string, e: string) => (ar ? a : e);
  const o = { align: ar ? ("right" as const) : ("left" as const) };
  drawCompanyDocumentIdentity(doc, identity, locale, t("فاتورة", "INVOICE"), row.number);
  doc
    .fontSize(10)
    .fillColor("#334155")
    .text(`${t("العميل", "Customer")}: ${ar ? row.customerNameAr ?? row.customerName : row.customerNameEn ?? row.customerName}`, o)
    .text(`${t("تاريخ الفاتورة", "Invoice date")}: ${row.invoiceDate.toISOString().slice(0, 10)}`, o)
    .text(`${t("الاستحقاق", "Due")}: ${row.dueDate?.toISOString().slice(0, 10) ?? "—"}`, o)
    .text(`${t("الحالة", "Status")}: ${row.status} / ${row.settlementStatus}`, o)
    .moveDown();
  row.lines.forEach((line: { position: number; itemName: string; itemNameAr?: string | null; itemNameEn?: string | null; quantity: unknown; unitPrice: unknown; totalAmount: unknown }) => {
    if (doc.y > 680) doc.addPage();
    doc
      .fontSize(9)
      .fillColor("#0f172a")
      .text(`${line.position}. ${ar ? line.itemNameAr ?? line.itemName : line.itemNameEn ?? line.itemName}`, { ...o, continued: false })
      .fontSize(8)
      .fillColor("#64748b")
      .text(`${Number(line.quantity).toFixed(3)} × ${Number(line.unitPrice).toFixed(3)} = ${Number(line.totalAmount).toFixed(3)} ${row.currencyCode}`, o)
      .moveDown(0.4);
  });
  const m = (v: unknown) => `${Number(v).toFixed(3)} ${row.currencyCode}`;
  doc
    .moveDown()
    .fontSize(10)
    .fillColor("#334155")
    .text(`${t("المجموع الفرعي", "Subtotal")}: ${m(row.subtotal)}`, o)
    .text(`${t("الخصم", "Discount")}: ${m(row.discountAmount)}`, o)
    .text(`${t("الضريبة", "Tax")}: ${m(row.taxAmount)}`, o)
    .fontSize(14)
    .fillColor("#0369a1")
    .text(`${t("الإجمالي", "Total")}: ${m(row.totalAmount)}`, o)
    .fontSize(10)
    .fillColor("#334155")
    .text(`${t("المدفوع", "Paid")}: ${m(row.paidAmount)}`, o)
    .text(`${t("المتبقي", "Outstanding")}: ${m(row.outstandingAmount)}`, o);
  if (row.notes) doc.moveDown().text(`${t("ملاحظات", "Notes")}: ${row.notes}`, o);
  doc.end();
  return finished;
}

export const GET = withCompanyAuth(["OWNER", "ADMIN", "SALES", "VIEWER"], async (request, auth, company) => {
  const row = await getInvoiceDocumentSnapshot(company.companyId, invoiceIdFromDocumentRequest(request, "pdf"));
  const bytes = await pdf(row, language(request, auth.user.locale));
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${row.number.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
