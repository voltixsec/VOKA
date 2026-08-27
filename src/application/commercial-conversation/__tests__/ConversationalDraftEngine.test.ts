import { describe, expect, it } from "vitest";
import { ConversationalDraftEngine } from "../ConversationalDraftEngine";

const engine = new ConversationalDraftEngine();
const start = (reply: string, operation?: any, attachment?: any) => engine.advance({ reply, replySource: "TEXT", locale: "ar", operation, attachment });

describe("ConversationalDraftEngine", () => {
  it("creates one working draft and merges a second answer into the same context", () => {
    const first = start("اعمل عرض سعر لـ20 كاميرات", "QUOTATION");
    expect(first.status).toBe("NEEDS_CLARIFICATION");
    expect(first.missingRequired.map((field) => field.key)).toEqual(["customer"]);
    const second = engine.advance({ draft: first, reply: "العميل شركة النور والدفع 50% مقدم", replySource: "VOICE", locale: "ar" });
    expect(second.id).toBe(first.id);
    expect(second.turns).toHaveLength(2);
    expect(second.fields.customerMention).toBe("شركة النور");
    expect(second.fields.paymentTerms).toContain("الدفع 50% مقدم");
    expect(second.missingRequired).toEqual([]);
    expect(second.status).toBe("READY_FOR_REVIEW");
  });

  it("does not let optional or recommended fields block readiness", () => {
    const draft = start("اعمل فاتورة للعميل شركة النور 2 أجهزة", "INVOICE");
    expect(draft.status).toBe("READY_FOR_REVIEW");
    expect(draft.recommended.map((field) => field.key)).toContain("currency");
  });

  it.each(["QUOTATION", "INVOICE", "CONTRACT"] as const)("keeps %s distinct while using customer and line form truth", (operation) => {
    const draft = start("العميل شركة النور 3 وحدات", operation);
    expect(draft.operation).toBe(operation);
    expect(draft.status).toBe("READY_FOR_REVIEW");
  });

  it("requires the real approved quotation source for a Sales Order", () => {
    const first = start("اعمل أمر بيع", "SALES_ORDER");
    expect(first.missingRequired.map((field) => field.key)).toEqual(["sourceReference"]);
    const second = engine.advance({ draft: first, reply: "من عرض السعر QT-1042", replySource: "CHIP", locale: "ar" });
    expect(second.id).toBe(first.id);
    expect(second.fields.sourceReference).toContain("QT-1042");
    expect(second.status).toBe("READY_FOR_REVIEW");
  });

  it("treats a chip as a real reply and immediately re-evaluates the same draft", () => {
    const first = start("اعمل عقد 2 وحدات", "CONTRACT");
    const next = engine.advance({ draft: first, reply: "العميل شركة النور", replySource: "CHIP", locale: "ar" });
    expect(next.id).toBe(first.id);
    expect(next.turns.at(-1)).toMatchObject({ source: "CHIP", text: "العميل شركة النور" });
    expect(next.status).toBe("READY_FOR_REVIEW");
  });

  it("preserves drawing attachment and context without claiming execution", () => {
    const attachment = { name: "plan.pdf", type: "application/pdf", size: 1200 };
    const draft = start("حلل الرسم واحصر الكاميرات", "DRAWING_TAKEOFF", attachment);
    expect(draft.attachment).toEqual(attachment);
    expect(draft.status).toBe("READY_FOR_REVIEW");
    expect(draft.requiresHumanReview).toBe(true);
    expect(draft.executed).toBe(false);
  });

  it("never marks a draft ready while core form requirements remain missing", () => {
    const draft = start("اعمل عرض سعر", "QUOTATION");
    expect(draft.status).toBe("NEEDS_CLARIFICATION");
    expect(draft.requiresHumanReview).toBe(true);
    expect(draft.executed).toBe(false);
  });
});
