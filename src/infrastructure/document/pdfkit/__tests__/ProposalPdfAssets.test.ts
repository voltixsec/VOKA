import { describe, expect, it, vi } from "vitest";
import type { QuotationDocumentSnapshot } from "@/src/application/document";
import {
  PROPOSAL_TEXT,
  decodeProposalImageDataUrl,
  drawProposalCompanyApproval,
  drawProposalHeader,
  drawProposalLetterhead,
  configureProposalTextDirection,
  proposalBidiRuns,
  proposalTextOptions,
  type ProposalPdfDocument,
} from "../ProposalPdfShared";
import { decorateExistingPages, PdfKitQuotationDocumentRenderer } from "../PdfKitQuotationDocumentRenderer";
import {
  columnPositions,
  drawTotals,
  proposalBoqItemText,
  shouldRenderProposalApproval,
} from "../ProposalPdfBoq";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";

function snapshot(status = "APPROVED", locale: "ar" | "en" = "en"): QuotationDocumentSnapshot {
  return {
    locale,
    company: { name: "VOKA", letterheadUrl: PNG, signatureUrl: PNG, stampUrl: PNG },
    qrValue: "VOKA:Q-1",
    quotation: {
      number: "Q-1", status, issueDate: new Date("2026-08-12"), expiryDate: null,
      currencyCode: "KWD", subjectAr: null, subjectEn: null, briefAr: null, briefEn: null,
      projectName: null, projectNameAr: null, projectNameEn: null,
      attentionName: null, attentionNameAr: null, attentionNameEn: null, scopeType: null,
      customer: { name: "Customer", email: null, phone: null, taxNumber: null, billingAddress: null },
      lines: [], discount: null,
      totals: { subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 },
      notes: null, notesAr: null, notesEn: null,
      termsAndConditions: null, termsAndConditionsAr: null, termsAndConditionsEn: null,
      approvedAt: status === "APPROVED" ? new Date("2026-08-12") : null,
      approvedByName: status === "APPROVED" ? "Approver" : null,
      approvedByRole: status === "APPROVED" ? "OWNER" : null,
    },
  };
}

function fakeDocument() {
  const texts: string[] = [];
  const textCalls: Array<{ value: string; x: number; y: number }> = [];
  const images: Buffer[] = [];
  const doc: Record<string, unknown> = { page: { width: 595, height: 842 } };
  for (const method of ["save", "restore", "rect", "roundedRect", "fill", "stroke", "lineWidth", "strokeColor", "fillColor", "fontSize", "moveTo", "lineTo"]) {
    doc[method] = vi.fn(() => doc);
  }
  doc.text = vi.fn((value: string, x = 0, y = 0) => { texts.push(value); textCalls.push({ value, x, y }); return doc; });
  doc.image = vi.fn((value: Buffer) => { images.push(value); return doc; });
  return { doc: doc as unknown as ProposalPdfDocument, texts, textCalls, images };
}

describe("proposal PDF document assets", () => {
  it("renders localized BOQ descriptions compactly and omits an empty description row", () => {
    const line: QuotationDocumentSnapshot["quotation"]["lines"][number] = {
      position: 1,
      type: "PRODUCT",
      itemCode: "SKU-1",
      itemName: "Item",
      itemNameAr: "بند",
      itemNameEn: "Item",
      description: "English description",
      descriptionAr: "وصف عربي",
      descriptionEn: "English description",
      unitName: "piece",
      unitNameAr: "قطعة",
      unitNameEn: "piece",
      quantity: 1,
      unitPrice: 10,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 10,
    };

    expect(proposalBoqItemText(line, "en")).toBe("1. Item\nEnglish description");
    expect(proposalBoqItemText(line, "ar")).toBe("1. بند\nوصف عربي");
    expect(proposalBoqItemText({
      ...line,
      description: null,
      descriptionAr: null,
      descriptionEn: "  ",
    }, "en")).toBe("1. Item");
  });

  it("decodes PNG and JPEG through one safe decoder", () => {
    expect(decodeProposalImageDataUrl(PNG)).toBeInstanceOf(Buffer);
    expect(decodeProposalImageDataUrl(JPEG)).toBeInstanceOf(Buffer);
  });

  it.each(["data:image/webp;base64,UklGRg==", "invalid", "data:image/png;base64,AAAA"])("ignores invalid or unsupported data: %s", (value) => {
    expect(decodeProposalImageDataUrl(value)).toBeNull();
  });

  it.each([PNG, JPEG])("draws a valid letterhead with page-fit containment", (letterheadUrl) => {
    const target = fakeDocument();
    const data = snapshot();
    data.company.letterheadUrl = letterheadUrl;
    expect(drawProposalLetterhead(target.doc, data)).toBe(true);
    expect(target.doc.image).toHaveBeenCalledWith(expect.any(Buffer), 0, 0, expect.objectContaining({ fit: [595, 842], align: "center", valign: "center" }));
  });

  it("renders a JPEG letterhead through PDFKit", async () => {
    const data = snapshot();
    data.company.letterheadUrl = JPEG;
    await expect(new PdfKitQuotationDocumentRenderer().render(data)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("does not crash for an invalid letterhead", () => {
    const target = fakeDocument();
    const data = snapshot();
    data.company.letterheadUrl = "data:image/png;base64,AAAA";
    expect(drawProposalLetterhead(target.doc, data)).toBe(false);
    expect(target.images).toHaveLength(0);
  });

  it.each([[true, false], [false, true], [true, true], [false, false]])("renders approved signature/stamp gracefully (%s/%s)", (hasSignature, hasStamp) => {
    const target = fakeDocument();
    const data = snapshot();
    data.company.signatureUrl = hasSignature ? PNG : null;
    data.company.stampUrl = hasStamp ? PNG : null;
    drawProposalCompanyApproval(target.doc, data, 600, 90);
    expect(target.images).toHaveLength(Number(hasSignature) + Number(hasStamp));
    expect(target.texts).toContain(PROPOSAL_TEXT.en.electronicApproval);
  });

  it("does not render signature, stamp, or electronic copy for an unapproved document", () => {
    const target = fakeDocument();
    drawProposalCompanyApproval(target.doc, snapshot("SENT"), 600, 90);
    expect(target.images).toHaveLength(0);
    expect(target.texts).not.toContain(PROPOSAL_TEXT.en.electronicApproval);
    expect(target.texts).not.toContain(PROPOSAL_TEXT.en.approvedBy);
    expect(target.texts).not.toContain(PROPOSAL_TEXT.en.pendingApproval);
    expect(target.texts).not.toContain(PROPOSAL_TEXT.en.signature);
    expect(target.texts).not.toContain(PROPOSAL_TEXT.en.approvalStatement);
    expect(target.doc.roundedRect).not.toHaveBeenCalled();
    expect(target.doc.lineTo).not.toHaveBeenCalled();
  });

  it("renders a separate tax row and authoritative final total when tax is positive", () => {
    const target = fakeDocument();
    const data = snapshot();
    data.quotation.totals = {
      subtotal: 100,
      discountAmount: 20,
      taxAmount: 8,
      totalAmount: 88,
    };
    data.quotation.discount = { type: "FIXED", value: 20 };

    drawTotals(target.doc, data, 500);

    expect(target.texts).toContain(PROPOSAL_TEXT.en.tax);
    expect(target.texts).toContain("KWD 8.000");
    expect(target.texts).toContain("KWD 88.000");
  });

  it("keeps the PDF totals summary clean when tax is zero", () => {
    const target = fakeDocument();
    const data = snapshot();
    data.quotation.totals = {
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 100,
    };

    drawTotals(target.doc, data, 500);

    expect(target.texts).not.toContain(PROPOSAL_TEXT.en.tax);
    expect(target.texts).toContain("KWD 100.000");
  });

  it.each(["DRAFT", "SENT", "REJECTED", "CANCELLED"])("omits the entire English approval block for %s", (status) => {
    const data = snapshot(status, "en");
    expect(shouldRenderProposalApproval(data)).toBe(false);
  });

  it.each(["DRAFT", "SENT", "REJECTED", "CANCELLED"])("omits the entire Arabic approval block for %s", (status) => {
    const data = snapshot(status, "ar");
    const target = fakeDocument();
    expect(shouldRenderProposalApproval(data)).toBe(false);
    drawProposalCompanyApproval(target.doc, data, 600, 90, Buffer.from([1, 2, 3]));
    expect(target.texts).toHaveLength(0);
    expect(target.images).toHaveLength(0);
    expect(target.doc.roundedRect).not.toHaveBeenCalled();
  });

  it("requires both approved status and approval date for the English approval block", () => {
    const data = snapshot("APPROVED", "en");
    data.quotation.approvedAt = null;
    expect(shouldRenderProposalApproval(data)).toBe(false);
    data.quotation.approvedAt = new Date("2026-08-12");
    expect(shouldRenderProposalApproval(data)).toBe(true);
  });

  it.each(["ar", "en"] as const)("uses the exact %s electronic approval copy", (locale) => {
    const target = fakeDocument();
    drawProposalCompanyApproval(target.doc, snapshot("APPROVED", locale), 600, 90);
    expect(target.texts).toContain(PROPOSAL_TEXT[locale].electronicApproval);
  });

  it("uses an English stationery header mode below the safe area without the normal header or logo", () => {
    const target = fakeDocument();
    const data = snapshot("APPROVED", "en");
    data.company.logoUrl = PNG;
    const y = drawProposalHeader(target.doc, data, true);
    expect(y).toBeGreaterThan(120);
    expect(target.doc.rect).not.toHaveBeenCalled();
    expect(target.images).toHaveLength(0);
    expect(target.textCalls.find((call) => call.value === "QUOTATION")?.y).toBeGreaterThanOrEqual(124);
  });

  it("uses the same Arabic stationery header mode without redundant company identity", () => {
    const target = fakeDocument();
    const data = snapshot("APPROVED", "ar");
    data.company.logoUrl = PNG;
    const y = drawProposalHeader(target.doc, data, true);
    expect(y).toBeGreaterThan(120);
    expect(target.doc.rect).not.toHaveBeenCalled();
    expect(target.images).toHaveLength(0);
    expect(target.texts).not.toContain("VOKA");
  });

  it("retains the normal English branded header and logo without letterhead mode", () => {
    const target = fakeDocument();
    const data = snapshot("APPROVED", "en");
    data.company.logoUrl = PNG;
    drawProposalHeader(target.doc, data, false);
    expect(target.doc.rect).toHaveBeenCalled();
    expect(target.images).toHaveLength(1);
  });

  it("uses lightweight traceability and suppresses the normal footer in English letterhead mode", () => {
    const target = fakeDocument();
    Object.assign(target.doc, {
      bufferedPageRange: vi.fn(() => ({ start: 0, count: 2 })),
      switchToPage: vi.fn(() => target.doc),
    });
    decorateExistingPages(target.doc, snapshot("APPROVED", "en"), Buffer.from([1]), [true, true]);
    expect(target.texts).toContain("Q-1 · 1 / 2");
    expect(target.texts).toContain("Q-1 · 2 / 2");
    expect(target.texts).not.toContain("VOKA — Q-1");
    expect(target.images).toHaveLength(0);
  });

  it("uses lightweight traceability and suppresses the normal footer in Arabic letterhead mode", () => {
    const target = fakeDocument();
    Object.assign(target.doc, {
      bufferedPageRange: vi.fn(() => ({ start: 0, count: 2 })),
      switchToPage: vi.fn(() => target.doc),
    });
    decorateExistingPages(target.doc, snapshot("APPROVED", "ar"), Buffer.from([1]), [true, true]);
    expect(target.texts).toContain("Q-1 · 1 / 2");
    expect(target.texts).not.toContain("VOKA — Q-1");
  });

  it.each([
    ["توريد نايلون ميكرون 1000 خمسة وعشرون لفة", "1000"],
    ["التوريد خلال 3 أيام من تاريخ عرض السعر", "3"],
    ["التوصيل على العميل 10 دينار", "10"],
    ["ساري المفعول لمدة 45 يوماً", "45"],
    ["يتم الدفع بنسبة 40% مقدماً و60% عند التسليم", "40%"],
    ["يتم الدفع بنسبة 40% مقدماً و60% عند التسليم", "60%"],
    ["القيمة KWD 450.000", "KWD 450.000"],
    ["المرجع QT-871202", "QT-871202"],
    ["النطاق Scope of Work", "Scope of Work"],
    ["الشروط Payment Terms", "Payment Terms"],
  ])("resolves Arabic mixed text while preserving %s", (value, expectedRun) => {
    const runs = proposalBidiRuns(value);
    expect(runs.map((run) => run.text).join("")).toContain(expectedRun);
    expect(runs.filter((run) => /^\s+$/u.test(run.text))).not.toHaveLength(0);
  });

  it("applies Bidi protection only to Arabic PDF text", () => {
    const target = fakeDocument();
    target.doc.widthOfString = vi.fn((value: string) => value.length * 5);
    target.doc.currentLineHeight = vi.fn(() => 12);
    configureProposalTextDirection(target.doc, "ar");
    target.doc.text("دفعة 40% Payment Terms", 0, 0, proposalTextOptions("right", 200));
    expect(target.texts).toContain("40%");
    expect(target.texts.join(" ")).toContain("Payment Terms");
  });

  it("places Arabic BOQ columns in conceptual right-to-left order", () => {
    const positions = columnPositions("ar", 38, 519, [
      { width: 207.6, align: "right" }, { width: 57.09, align: "center" },
      { width: 51.9, align: "right" }, { width: 88.23, align: "right" },
      { width: 51.9, align: "right" }, { width: 62.28, align: "right" },
    ]);
    expect(positions).toEqual([...positions].sort((a, b) => b - a));
  });

  it("retains normal footer traceability without the former decorative QR", () => {
    const target = fakeDocument();
    Object.assign(target.doc, {
      bufferedPageRange: vi.fn(() => ({ start: 0, count: 2 })),
      switchToPage: vi.fn(() => target.doc),
    });
    decorateExistingPages(target.doc, snapshot("APPROVED", "en"), Buffer.from([1]), [false, false]);
    expect(target.texts).toContain("VOKA — Q-1");
    expect(target.images).toHaveLength(0);
  });

  it("separates the English approval date and electronic copy coordinates", () => {
    const target = fakeDocument();
    drawProposalCompanyApproval(target.doc, snapshot("APPROVED", "en"), 600, 112);
    const approval = target.textCalls.find((call) => call.value === PROPOSAL_TEXT.en.electronicApproval);
    const date = target.textCalls.find((call) => call.value.includes("12/08/2026"));
    expect(approval).toBeDefined();
    expect(date).toBeDefined();
    expect((approval?.y ?? 0) - (date?.y ?? 0)).toBeGreaterThan(20);
    expect(target.texts).not.toContain(PROPOSAL_TEXT.en.approvalStatement);
  });

  it("suppresses the fallback signature line when a real signature exists", () => {
    const target = fakeDocument();
    drawProposalCompanyApproval(target.doc, snapshot("APPROVED", "en"), 600, 112);
    expect(target.doc.lineTo).not.toHaveBeenCalled();
  });

  it("keeps the fallback signature line when an approved document has no signature", () => {
    const target = fakeDocument();
    const data = snapshot("APPROVED", "en");
    data.company.signatureUrl = null;
    drawProposalCompanyApproval(target.doc, data, 600, 112);
    expect(target.doc.lineTo).toHaveBeenCalled();
  });

  it("renders a labelled official verification QR only inside an approved English block", () => {
    const approved = fakeDocument();
    drawProposalCompanyApproval(approved.doc, snapshot("APPROVED", "en"), 600, 112, Buffer.from([1, 2, 3]));
    expect(approved.texts).toContain("Verify document");
    expect(approved.images).toHaveLength(3);

    const pending = fakeDocument();
    drawProposalCompanyApproval(pending.doc, snapshot("SENT", "en"), 600, 112, Buffer.from([1, 2, 3]));
    expect(pending.texts).not.toContain("Verify document");
    expect(pending.images).toHaveLength(0);
  });

  it("renders a labelled official verification QR only inside an approved Arabic block", () => {
    const approved = fakeDocument();
    drawProposalCompanyApproval(approved.doc, snapshot("APPROVED", "ar"), 600, 112, Buffer.from([1, 2, 3]));
    expect(approved.texts).toContain("التحقق من المستند");
    expect(approved.images).toHaveLength(3);

    const draft = fakeDocument();
    drawProposalCompanyApproval(draft.doc, snapshot("DRAFT", "ar"), 600, 112, Buffer.from([1, 2, 3]));
    expect(draft.images).toHaveLength(0);
  });
});
