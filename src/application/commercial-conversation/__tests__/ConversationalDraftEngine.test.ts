import { describe, expect, it } from "vitest";
import { applyCustomerResolution, ConversationalDraftEngine } from "../ConversationalDraftEngine";
import { normalizeTechnicalSpeech } from "../technical-speech";

const engine = new ConversationalDraftEngine();
const start = (reply: string, operation?: any, attachment?: any) => engine.advance({ reply, replySource: "TEXT", locale: "ar", operation, attachment });
const resolveNoor = (draft: ReturnType<typeof start>) => applyCustomerResolution(draft, [{ id: "customer-1", name: "شركة النور" }]);

describe("ConversationalDraftEngine", () => {
  it("creates one working draft and merges a second answer into the same context", () => {
    const first = start("اعمل عرض سعر لـ20 كاميرات", "QUOTATION");
    expect(first.status).toBe("NEEDS_CLARIFICATION");
    expect(first.missingRequired.map((field) => field.key)).toEqual(["customer"]);
    const second = resolveNoor(engine.advance({ draft: first, reply: "العميل شركة النور والدفع 50% مقدم", replySource: "VOICE", locale: "ar" }));
    expect(second.id).toBe(first.id);
    expect(second.turns).toHaveLength(2);
    expect(second.fields.customerMention).toBe("شركة النور");
    expect(second.fields.paymentTerms).toContain("الدفع 50% مقدم");
    expect(second.missingRequired).toEqual([]);
    expect(second.status).toBe("READY_FOR_REVIEW");
  });

  it("does not let optional or recommended fields block readiness", () => {
    const draft = resolveNoor(start("اعمل فاتورة للعميل شركة النور 2 أجهزة", "INVOICE"));
    expect(draft.status).toBe("READY_FOR_REVIEW");
    expect(draft.recommended.map((field) => field.key)).toContain("currency");
  });

  it.each(["QUOTATION", "INVOICE", "CONTRACT"] as const)("keeps %s distinct while using customer and line form truth", (operation) => {
    const draft = resolveNoor(start("العميل شركة النور 3 وحدات", operation));
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
    const next = resolveNoor(engine.advance({ draft: first, reply: "العميل شركة النور", replySource: "CHIP", locale: "ar" }));
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

  it("normalizes only known mixed-language technical speech variants", () => {
    expect(normalizeTechnicalSpeech("12 كاميرا مع إن في آر و بي او اي و آر جي 45 و أربع ميجا بكسل")).toBe("12 كاميرا مع NVR و PoE و RJ45 و 4MP");
    expect(normalizeTechnicalSpeech("custom unsupported device")).toBe("custom unsupported device");
  });

  it("resolves one tenant customer and removes only that required field", () => {
    const draft = start("عرض سعر للعميل شركة النور 12 كاميرا مع إن في آر", "QUOTATION");
    const resolved = applyCustomerResolution(draft, [{ id: "customer-1", name: "شركة النور" }]);
    expect(resolved.fields.customerId).toBe("customer-1");
    expect(resolved.fields.lines[0].itemName).toContain("NVR");
    expect(resolved.missingRequired).toEqual([]);
  });

  it("asks for a choice when customer matching is ambiguous", () => {
    const draft = start("عرض سعر للعميل النور 2 كاميرا", "QUOTATION");
    const resolved = applyCustomerResolution(draft, [{ id: "1", name: "شركة النور" }, { id: "2", name: "مؤسسة النور" }]);
    expect(resolved.customerResolution.status).toBe("AMBIGUOUS");
    expect(resolved.clarification?.suggestions).toHaveLength(2);
    expect(resolved.status).toBe("NEEDS_CLARIFICATION");
  });

  it("preserves a stated unknown customer as proposed without creating one", () => {
    const draft = start("فاتورة للعميل عميل غير موجود 2 أجهزة", "INVOICE");
    const resolved = applyCustomerResolution(draft, []);
    expect(resolved.customerResolution.status).toBe("NOT_FOUND");
    expect(resolved.missingRequired.map((field) => field.key)).not.toContain("customer");
    expect(resolved).toMatchObject({ proposedCustomerName: "عميل غير موجود", customerState: "CUSTOMER_PROPOSED_UNREGISTERED", status: "READY_FOR_REVIEW" });
    expect(resolved.executed).toBe(false);
  });
});
