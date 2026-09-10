import { NextResponse } from "next/server";
import { ApiError, withCompanyAuth } from "@/lib/api";
import { localizeCompanyDocumentIdentity } from "@/lib/documents/company-document-identity";
import { commercialSnapshotFromParts, renderCommercialProposalPdf } from "@/lib/documents/commercial-pdf";
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
    const requestedLocale = new URL(request.url).searchParams.get("locale");
    if (requestedLocale && requestedLocale !== "ar" && requestedLocale !== "en") {
      throw ApiError.badRequest("DOCUMENT_LOCALE_INVALID", "locale must be ar or en.");
    }
    const locale: "ar" | "en" = (requestedLocale === "ar" || requestedLocale === "en" ? requestedLocale : null) || (auth.user.locale.toLowerCase().startsWith("ar") ? "ar" : "en");
    const ar = locale === "ar";
    const identity = localizeCompanyDocumentIdentity(s.companyIdentity, locale, s.companyIdentity.name || "VOKA");
    const text = (a: string | null | undefined, e: string | null | undefined, f = "") =>
      ar ? (a ?? e ?? f) : (e ?? a ?? f);
    const milestoneNotes = s.milestones
      .map((m) => `${m.position}. ${text(m.titleAr, m.titleEn, m.title)} — ${m.amountType === "PERCENTAGE" ? m.percentage : m.fixedAmount} (${displayLabel(m.amountType, locale)})`)
      .join("\n");
    const snapshot = commercialSnapshotFromParts({
      kind: "CONTRACT",
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
      number: s.number,
      status: s.status,
      issueDate: new Date(s.contractDate),
      currencyCode: s.currencyCode,
      customerName: text(s.customer.nameAr, s.customer.nameEn, s.customer.name),
      customerEmail: s.customer.email,
      customerPhone: s.customer.phone,
      customerTaxNo: s.customer.taxNumber,
      billingAddress: s.customer.billingAddress,
      subjectAr: s.subjectAr,
      subjectEn: s.subjectEn,
      briefAr: s.briefAr,
      briefEn: s.briefEn,
      projectName: s.projectName,
      projectNameAr: s.projectNameAr,
      projectNameEn: s.projectNameEn,
      attentionName: s.attentionName,
      attentionNameAr: s.attentionNameAr,
      attentionNameEn: s.attentionNameEn,
      scopeType: s.scopeType,
      lines: s.lines.map((l) => ({
        position: l.position,
        type: l.type,
        itemCode: l.itemCode,
        itemName: l.itemName,
        itemNameAr: l.itemNameAr,
        itemNameEn: l.itemNameEn,
        description: l.description,
        descriptionAr: l.descriptionAr,
        descriptionEn: l.descriptionEn,
        unitName: l.unitName,
        unitNameAr: l.unitNameAr,
        unitNameEn: l.unitNameEn,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        taxAmount: l.taxAmount,
        totalAmount: l.totalAmount,
      })),
      discountType: s.discountType === "PERCENTAGE" || s.discountType === "FIXED" ? s.discountType : null,
      discountValue: s.discountValue,
      totals: {
        subtotal: s.subtotal,
        discountAmount: s.discountAmount,
        taxAmount: s.taxAmount,
        totalAmount: s.totalAmount,
      },
      notes: s.notes,
      notesAr: s.notesAr,
      notesEn: s.notesEn,
      terms: [s.termsAndConditions, milestoneNotes].filter(Boolean).join("\n") || null,
      termsAr: s.termsAndConditionsAr,
      termsEn: s.termsAndConditionsEn,
    });
    const bytes = await renderCommercialProposalPdf(snapshot, "CONTRACT");
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
