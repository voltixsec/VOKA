import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../../ai-sales-assistant/services/AISalesAssistantService";
import type { ProvisionalSystemModel } from "../../agentic-commercial-intelligence";
import { customerMatchScore } from "@/features/customers/domain/customer-discovery";
import { CompleteCommercialConversation } from "../CompleteCommercialConversation";
import type { WorkingCommercialDraft } from "../types";
import { explicitPaymentTerms, normalizePaymentTerms, parsePaymentSchedule } from "../../ai-sales-assistant/services/payment-terms";

function vehicleElevatorModel(): ProvisionalSystemModel {
  return {
    systemName: "Vehicle Elevator", aliases: ["Car lift"], purpose: "Vehicle movement between floors",
    componentCategories: ["Drive", "Platform", "Controller", "Doors", "Safety"],
    inputs: [
      { name: "elevatorQuantity", labelAr: "عدد المصاعد", labelEn: "Elevator quantity", value: null, required: true, provenance: "NEEDS_CONFIRMATION" },
      { name: "numberOfStops", labelAr: "عدد الوقفات", labelEn: "Number of stops", value: null, required: true, provenance: "NEEDS_CONFIRMATION" },
      { name: "capacity", labelAr: "الحمولة", labelEn: "Capacity", value: null, unit: "kg", required: true, provenance: "NEEDS_CONFIRMATION" },
    ],
    limitations: ["Engineering verification required."], confidence: .75, jurisdiction: "Kuwait",
    evidence: [{ title: "Technical guide", url: "https://manufacturer.example/vehicle-lift", publisher: "manufacturer.example", provenance: "RESEARCHED" }],
    provenance: "RESEARCHED", requiresEngineeringVerification: true,
  };
}

function fixture(options: { customerNames?: string[]; terms?: string | null } = {}) {
  const research = { researchSystem: vi.fn().mockResolvedValue(vehicleElevatorModel()) };
  const provider = {
    extractIntent: vi.fn().mockImplementation(async (inputArg: any) => {
      const text = typeof inputArg === "string" ? inputArg : inputArg?.reply ?? inputArg?.prompt ?? "";
      const mention = text.includes("وطنية") || text.includes("الوطنية") ? "الوطنية" : text.includes("الشركة العالمية الحديثة") ? "الشركة العالمية الحديثة" : null;
      return {
        documentType: "QUOTATION",
        scopeType: "SUPPLY_AND_INSTALLATION",
        customerMention: mention,
        lines: text.includes("130 كاميرا") ? [{ text: "كاميرا مراقبة", quantity: 130, typeIntent: "PRODUCT" }] : [{ text: "مصعد سيارات", quantity: null, typeIntent: "PRODUCT" }],
      };
    }),
  };
  const customers = (options.customerNames ?? ["الوطنية"]).map((name, i) => ({ id: `c${i}`, name, code: `C${i}`, status: "ACTIVE" }));
  const service = new AISalesAssistantService({
    companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) },
    customers: { findAll: vi.fn().mockImplementation(async ({ search }: { search?: string } = {}) => customers.filter((customer) => (search ? customerMatchScore(customer, search) > 0 : true))) },
    catalogItems: { findAll: vi.fn().mockResolvedValue([]) },
    units: { findById: vi.fn(), findBySymbol: vi.fn() },
    quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
    pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() },
    terms: { find: vi.fn().mockResolvedValue(options.terms === undefined ? null : options.terms) },
  } as any, provider, research);

  const conversation = new CompleteCommercialConversation(service);
  const run = (reply: string, draft?: WorkingCommercialDraft, extra: Record<string, unknown> = {}) =>
    conversation.execute({ companyId: "tenant-a", reply, draft, replySource: "TEXT", locale: "ar", documentMode: "QUOTATION", ...extra });

  return { research, service, run };
}

describe("System-First Clarification & Governed Safe Skip/Defer", () => {
  // 1. Technical/system questions outrank generic commercial questions
  it("prioritizes technical system inputs over generic commercial fields", async () => {
    const { run } = fixture();
    const draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    expect(draft.activeQuestion?.field).toBe("elevatorQuantity");
    expect(draft.missingRequired[0].key).toBe("systemInput");
    expect(draft.activeQuestion?.ar).toBe("كم عدد المصاعد المطلوبة؟");
  });

  // 2. Customer does not interrupt unfinished system clarification
  it("does not allow customer question to interrupt ongoing system clarification", async () => {
    const { run } = fixture({ customerNames: ["الشركة الوطنية"] });
    const draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    expect(draft.activeQuestion?.field).toBe("elevatorQuantity");
    expect(draft.activeQuestion?.field).not.toBe("customerMention");
    expect(draft.missingRequired.find((f) => f.key === "customer")).toBeDefined();
    // System input is missingRequired[0], ahead of customer
    expect(draft.missingRequired.findIndex((f) => f.key === "systemInput")).toBeLessThan(
      draft.missingRequired.findIndex((f) => f.key === "customer")
    );
  });

  // 3. Payment does not interrupt unfinished system clarification
  it("does not allow payment terms question to interrupt ongoing system clarification", async () => {
    const { run } = fixture();
    const draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    expect(draft.activeQuestion?.field).toBe("elevatorQuantity");
    expect(draft.activeQuestion?.field).not.toBe("paymentTerms");
    const sysIdx = draft.missingRequired.findIndex((f) => f.key === "systemInput");
    const payIdx = draft.missingRequired.findIndex((f) => f.key === "paymentTerms");
    if (payIdx !== -1) {
      expect(sysIdx).toBeLessThan(payIdx);
    }
  });

  it("does not allow quotation validity to interrupt ongoing system clarification", async () => {
    const { run } = fixture();
    const draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    const systemIndex = draft.missingRequired.findIndex((field) => field.key === "systemInput");
    const validityIndex = draft.missingRequired.findIndex((field) => field.key === "expiryDate");
    expect(draft.activeQuestion?.field).toBe("elevatorQuantity");
    expect(systemIndex).toBeGreaterThanOrEqual(0);
    expect(validityIndex).toBeGreaterThan(systemIndex);
  });

  // 4. Skip for now appears only when permitted
  it("shows allowDefer=true and Skip for now labels only for deferrable fields", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    // Critical system input: defer NOT allowed
    expect(draft.activeQuestion?.field).toBe("elevatorQuantity");
    expect(draft.activeQuestion?.allowDefer).toBe(false);

    // Provide system inputs
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("2000", draft); // capacity

    // System is now clear; next is customer (deferrable)
    expect(draft.activeQuestion?.field).toBe("customerMention");
    expect(draft.activeQuestion?.allowDefer).toBe(true);
    expect(draft.activeQuestion?.deferLabelAr).toBe("تجاوز الآن");
    expect(draft.activeQuestion?.deferLabelEn).toBe("Skip for now");
  });

  // 5. Defer does not equal resolved
  it("marks deferred fields as DEFERRED without setting them as resolved", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("2000", draft);

    expect(draft.activeQuestion?.field).toBe("customerMention");
    const deferredDraft = await run("تجاوز الآن", draft);

    const customerField = deferredDraft.missingRequired.find((f) => f.key === "customer");
    expect(customerField?.state).toBe("DEFERRED");
    expect(deferredDraft.fields.customerId).toBeNull();
    expect(deferredDraft.answers?.customerMention).toBeUndefined();
    expect(deferredDraft.customerState).not.toBe("CUSTOMER_RESOLVED");
  });

  // 6. Defer does not fabricate a value
  it("does not fabricate a dummy or default value when user skips a field", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("2000", draft);

    const skippedCustomer = await run("تجاوز الآن", draft);
    expect(skippedCustomer.canonicalProposal?.customer.mention).toBeNull();
    expect(skippedCustomer.proposedCustomerName).toBeNull();

    let skippedValidity = await run("تجاوز الآن", skippedCustomer); // project
    skippedValidity = await run("تجاوز الآن", skippedValidity); // attention
    skippedValidity = await run("تجاوز الآن", skippedValidity); // validity
    expect(skippedValidity.answers?.expiryDate).toBeUndefined();
  });

  // 7. Deferred question is not immediately repeated
  it("moves to the next question and does not immediately repeat a deferred question", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("2000", draft);

    expect(draft.activeQuestion?.field).toBe("customerMention");
    const next = await run("تجاوز الآن", draft);
    expect(next.activeQuestion?.field).not.toBe("customerMention");
    expect(next.activeQuestion?.field).toBe("projectName");
  });

  // 8. Conversation continues after defer
  it("allows conversation to proceed normally through remaining questions after deferring", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("2000", draft);

    draft = await run("تجاوز الآن", draft); // Skip customer
    expect(draft.activeQuestion?.field).toBe("projectName");
    draft = await run("تجاوز الآن", draft); // Skip project
    expect(draft.activeQuestion?.field).toBe("attentionName");
    draft = await run("تجاوز الآن", draft); // Skip attention
    expect(draft.activeQuestion?.field).toBe("expiryDate");

    draft = await run("تجاوز الآن", draft); // Skip expiry
    expect(draft.activeQuestion?.field).toBe("paymentTerms");

    draft = await run("50% مقدم و50% بعد التوريد", draft); // Answer payment
    expect(draft.canonicalProposal?.paymentSchedule?.totalPercentage).toBe(100);
    expect(draft.status).toBe("NEEDS_CLARIFICATION"); // Delivery/warranty still pending
  });

  // 9. Deferred commercial field can be requested later
  it("allows providing a deferred commercial field on a later turn", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("2000", draft);

    draft = await run("تجاوز الآن", draft); // Defer customer
    expect(draft.deferredFields).toContain("customerMention");

    // Explicitly supply customer now
    draft = await run("العميل الشركة الوطنية", draft);
    expect(draft.deferredFields).not.toContain("customerMention");
    expect(draft.canonicalProposal?.customer.name).toBe("الوطنية");
  });

  // 10. Critical engineering field cannot be silently skipped
  it("prevents silent skipping of critical engineering inputs", async () => {
    const { run } = fixture();
    const draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");

    const attemptSkip = await run("تجاوز الآن", draft);
    expect(attemptSkip.activeQuestion?.field).toBe("elevatorQuantity");
    expect(attemptSkip.deferredFields).not.toContain("elevatorQuantity");
  });

  // 11. Critical defer attempt produces clear human explanation
  it("produces a concise human explanation when deferring a non-deferrable field", async () => {
    const { run } = fixture();
    const draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    const attemptSkip = await run("تجاوز الآن", draft);

    expect(attemptSkip.activeQuestion?.nonDeferrableNotice?.ar).toContain("المعلومة دي لازمة علشان نكوّن النظام بشكل صحيح");
    expect(attemptSkip.clarification?.ar).toContain("المعلومة دي لازمة علشان نكوّن النظام بشكل صحيح");
  });

  // 12. Attachment/evidence alternative may be offered where appropriate
  it("offers attachment suggestion as an alternative when critical input defer is attempted", async () => {
    const { run } = fixture();
    const draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    const attemptSkip = await run("تجاوز الآن", draft);

    expect(attemptSkip.clarification?.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ar: "إرفاق مخطط", reply: "أرفق ملف الرسم" }),
      ])
    );
  });

  // 13. Internal schema wording never leaks into user-facing question
  it("ensures internal schema wording never leaks into user-facing questions", async () => {
    const { run } = fixture();
    const draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    expect(draft.activeQuestion?.ar).not.toMatch(/بيانات التكوين الأساسية|configuration inputs required|required commercial field/i);
    expect(draft.activeQuestion?.ar).toBe("كم عدد المصاعد المطلوبة؟");
  });

  // 14. Vehicle Elevator continuity remains correct
  it("maintains vehicle elevator continuity across clarification turns", async () => {
    const { research, run } = fixture();
    const first = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    expect(first.canonicalProposal?.agenticState).toMatchObject({
      systemName: "Vehicle Elevator",
      missingInputs: ["elevatorQuantity", "numberOfStops", "capacity"],
    });

    const second = await run("مصعد سيارات واحد يخدم 6 طوابق.", first);
    expect(second.systemAnswers).toMatchObject({ elevatorQuantity: 1, numberOfStops: 6 });
    expect(second.canonicalProposal?.agenticState?.missingInputs).toEqual(["capacity"]);
    expect(second.activeQuestion?.ar).toBe("ما الحمولة المطلوبة للمصعد؟");
    expect(research.researchSystem).toHaveBeenCalledTimes(1);
  });

  // 15. Explicit 50/50 payment remains correct
  it("correctly parses explicit 50/50 payment terms", () => {
    const inputs = [
      "50% مقدم و50% بعد التوريد",
      "50% مقدم و 50% بعد التوريد",
      "خمسين في المية مقدم وخمسين في المية بعد التوريد",
    ];
    for (const text of inputs) {
      const explicit = explicitPaymentTerms(text);
      const normalized = normalizePaymentTerms(explicit ?? text, "ar");
      const schedule = parsePaymentSchedule(normalized.text ?? text);
      expect(schedule?.complete).toBe(true);
      expect(schedule?.totalPercentage).toBe(100);
      expect(schedule?.milestones).toHaveLength(2);
      expect(schedule?.milestones[0].percentage).toBe(50);
      expect(schedule?.milestones[1].percentage).toBe(50);
    }
  });

  // 16. 40/60 payment correction remains correct
  it("correctly parses 40/60 payment terms correction", () => {
    const text = "40% مقدم و60% بعد التوريد";
    const schedule = parsePaymentSchedule(text);
    expect(schedule?.complete).toBe(true);
    expect(schedule?.totalPercentage).toBe(100);
    expect(schedule?.milestones[0].percentage).toBe(40);
    expect(schedule?.milestones[1].percentage).toBe(60);
  });

  // 17. Arabic 100% wording remains correct
  it("correctly parses Arabic 100% upfront wording", () => {
    const inputs = ["مية في المية مقدم", "100% مقدم", "مائة بالمائة مقدم"];
    for (const text of inputs) {
      const explicit = explicitPaymentTerms(text);
      const normalized = normalizePaymentTerms(explicit ?? text, "ar");
      const schedule = parsePaymentSchedule(normalized.text ?? text);
      expect(schedule?.complete).toBe(true);
      expect(schedule?.totalPercentage).toBe(100);
      expect(schedule?.milestones[0].percentage).toBe(100);
    }
  });

  // 18. Unknown customer remains non-blocking
  it("keeps proposed unregistered customer non-blocking", async () => {
    const { run } = fixture({ customerNames: [] });
    let draft = await run("عايز عرض سعر توريد 10 كاميرات للشركة العالمية الحديثة");
    expect(draft.customerState).toBe("CUSTOMER_PROPOSED_UNREGISTERED");
    expect(draft.proposedCustomerName).toBe("الشركة العالمية الحديثة");
    expect(draft.activeQuestion?.field).not.toBe("customerMention");
  });

  // 19. CCTV Golden Scenario remains green
  it("maintains CCTV 130-camera Golden Scenario accuracy", async () => {
    const { run } = fixture({ customerNames: ["الوطنية"] });
    const draft = await run("اعمل عرض سعر توريد وتركيب 130 كاميرا مراقبة للوطنية", undefined, {
      attachment: { name: "drawing.pdf", type: "application/pdf", size: 100 },
    });
    expect(draft.canonicalProposal?.lines.find((l) => l.itemName.includes("كاميرا"))?.quantity).toBe(130);
    expect(draft.customerState).toBe("CUSTOMER_RESOLVED");
  });

  // 20. All Transactional Commercial Brain invariants remain green
  it("preserves transactional ledger and readiness invariants during deferral", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("2000", draft);

    const deferredCustomer = await run("تجاوز الآن", draft);
    expect(deferredCustomer.transactionalState?.ledger.facts["customerMention"]).toMatchObject({
      value: "DEFERRED",
      source: "USER_EXPLICIT",
    });
    expect(deferredCustomer.readinessStage).not.toBe("READY_FOR_DRAFT");
  });
});
