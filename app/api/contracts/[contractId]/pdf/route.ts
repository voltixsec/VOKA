import { NextResponse } from "next/server";
import { withCompanyAuth } from "@/lib/api";
import { localizeCompanyDocumentIdentity } from "@/lib/documents/company-document-identity";
import { renderCommercialPdf } from "@/lib/documents/commercial-pdf";
import { displayLabel } from "@/lib/i18n/display-labels";
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
    const text = (a: string | null | undefined, e: string | null | undefined, f = "") =>
      ar ? (a ?? e ?? f) : (e ?? a ?? f);
    const bytes = await renderCommercialPdf({
      kind: "CONTRACT",
      locale,
      identity,
      number: s.number,
      status: s.status,
      customerName: text(s.customer.nameAr, s.customer.nameEn, s.customer.name),
      dateLabel: ar ? "التاريخ" : "Date",
      dateValue: s.contractDate.slice(0, 10),
      currencyCode: s.currencyCode,
      provenance: `${s.provenance.origin} / ${s.provenance.sourceKind ?? "—"} / ${s.provenance.sourceId ?? "—"}`,
      lines: s.lines.map((l) => ({
        position: l.position,
        name: text(l.itemNameAr, l.itemNameEn, l.itemName),
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        total: l.totalAmount,
      })),
      subtotal: s.subtotal,
      discountAmount: s.discountAmount,
      taxAmount: s.taxAmount,
      totalAmount: s.totalAmount,
      terms: text(s.termsAndConditionsAr, s.termsAndConditionsEn, s.termsAndConditions ?? ""),
      milestones: s.milestones.map((m) => ({
        position: m.position,
        title: text(m.titleAr, m.titleEn, m.title),
        amount: `${m.amountType === "PERCENTAGE" ? m.percentage : m.fixedAmount} (${displayLabel(m.amountType, locale)})`,
      })),
    });
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
