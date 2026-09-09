import path from "node:path";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { withCompanyAuth } from "@/lib/api";
import {
  drawCompanyDocumentIdentity,
  localizeCompanyDocumentIdentity,
} from "@/lib/documents/company-document-identity";
import {
  contractIdFromDocumentRequest,
  getContractDocumentSnapshot,
} from "@/lib/documents/contract-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, auth, company) => {
    const s = await getContractDocumentSnapshot(
      company.companyId,
      contractIdFromDocumentRequest(request, "pdf"),
    );
    const ar = auth.user.locale.startsWith("ar");
    const locale = ar ? "ar" : "en";
    const identity = localizeCompanyDocumentIdentity(s.companyIdentity, locale, s.companyIdentity.name || "VOKA");
    const t = (a: string, e: string) => (ar ? a : e);
    const text = (a: string | null | undefined, e: string | null | undefined, f = "") =>
      ar ? (a ?? e ?? f) : (e ?? a ?? f);
    const o = { align: ar ? ("right" as const) : ("left" as const) };
    const d = new PDFDocument({
      size: "A4",
      margin: 42,
      info: { Title: s.number, Author: identity.name },
    });
    const chunks: Buffer[] = [];
    d.on("data", (x) => chunks.push(Buffer.from(x)));
    const done = new Promise<Buffer>((resolve, reject) => {
      d.on("end", () => resolve(Buffer.concat(chunks)));
      d.on("error", reject);
    });
    d.registerFont("VOKA", path.join(process.cwd(), "assets", "fonts", "Cairo-Variable.ttf")).font("VOKA");
    drawCompanyDocumentIdentity(d, identity, locale, t("عقد", "CONTRACT"), s.number);
    d.fontSize(10)
      .fillColor("#334155")
      .text(`${t("الحالة", "Status")}: ${s.status}`, o)
      .text(`${t("العميل", "Customer")}: ${text(s.customer.nameAr, s.customer.nameEn, s.customer.name)}`, o)
      .text(`${t("التاريخ", "Date")}: ${s.contractDate.slice(0, 10)}`, o)
      .text(`${t("العملة", "Currency")}: ${s.currencyCode}`, o)
      .text(`${t("المصدر", "Source")}: ${s.provenance.origin} / ${s.provenance.sourceKind ?? "—"} / ${s.provenance.sourceId ?? "—"}`, o)
      .moveDown();
    for (const l of s.lines) {
      if (d.y > 690) d.addPage();
      d.fillColor("#0f172a")
        .fontSize(10)
        .text(`${l.position}. ${text(l.itemNameAr, l.itemNameEn, l.itemName)}`, o)
        .fontSize(9)
        .fillColor("#64748b")
        .text(`${l.quantity.toFixed(3)} × ${l.unitPrice.toFixed(3)} = ${l.totalAmount.toFixed(3)} ${s.currencyCode}`, o)
        .moveDown(0.4);
    }
    d.moveDown()
      .fontSize(10)
      .fillColor("#334155")
      .text(`${t("المجموع الفرعي", "Subtotal")}: ${s.subtotal.toFixed(3)} ${s.currencyCode}`, o)
      .text(`${t("الخصم", "Discount")}: ${s.discountAmount.toFixed(3)} ${s.currencyCode}`, o)
      .text(`${t("الضريبة", "Tax")}: ${s.taxAmount.toFixed(3)} ${s.currencyCode}`, o)
      .fontSize(14)
      .fillColor("#0369a1")
      .text(`${t("الإجمالي", "Total")}: ${s.totalAmount.toFixed(3)} ${s.currencyCode}`, o);
    if (s.milestones.length) {
      d.moveDown().fontSize(12).text(t("جدول الدفعات", "Milestones"), o);
      for (const m of s.milestones) {
        d.fontSize(9).text(
          `${m.position}. ${text(m.titleAr, m.titleEn, m.title)} — ${m.amountType === "PERCENTAGE" ? m.percentage : m.fixedAmount} (${m.amountType})`,
          o,
        );
      }
    }
    const terms = text(s.termsAndConditionsAr, s.termsAndConditionsEn, s.termsAndConditions ?? "");
    if (terms) d.moveDown().fontSize(9).text(`${t("الشروط", "Terms")}: ${terms}`, o);
    d.end();
    const bytes = await done;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="contract-${s.number.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
