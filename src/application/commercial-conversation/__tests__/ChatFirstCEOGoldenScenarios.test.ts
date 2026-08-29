import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../../ai-sales-assistant/services/AISalesAssistantService";
import type { ProvisionalSystemModel } from "../../agentic-commercial-intelligence";
import { CompleteCommercialConversation } from "../CompleteCommercialConversation";
import { commitTurnDecision, type TurnDecision } from "../transactional-state";
import type { ConversationReplySource, WorkingCommercialDraft } from "../types";

function systemModel(kind: "elevator" | "fm200"): ProvisionalSystemModel {
  if (kind === "fm200") return {
    systemName: "FM-200 Fire Suppression", aliases: ["FM200"], purpose: "Protected enclosure fire suppression",
    componentCategories: ["Cylinder", "Valves", "Nozzles", "Detection", "Controls"],
    inputs: [{ name: "protectedVolume", labelAr: "حجم الحيز المحمي", labelEn: "Protected volume", unit: "m3", value: null, required: true, provenance: "NEEDS_CONFIRMATION" }],
    limitations: ["Agent quantity and cylinder sizing require trusted dimensions and engineering rules."], confidence: .8, jurisdiction: "Kuwait",
    evidence: [{ title: "Manufacturer design guide", url: "https://manufacturer.example/fm200", publisher: "manufacturer.example", provenance: "RESEARCHED" }],
    provenance: "RESEARCHED", requiresEngineeringVerification: true,
  };
  return {
    systemName: "Vehicle Elevator", aliases: ["Car lift"], purpose: "Vehicle movement between floors",
    componentCategories: ["Drive", "Platform", "Controller", "Doors", "Safety"],
    inputs: [
      { name: "elevatorQuantity", labelAr: "عدد المصاعد", labelEn: "Elevator quantity", value: null, required: true, provenance: "NEEDS_CONFIRMATION" },
      { name: "numberOfStops", labelAr: "عدد الوقفات", labelEn: "Stops", value: null, required: true, provenance: "NEEDS_CONFIRMATION" },
      { name: "capacity", labelAr: "الحمولة", labelEn: "Capacity", unit: "kg", value: null, required: true, provenance: "NEEDS_CONFIRMATION" },
    ],
    limitations: ["Final load and dimensions require project drawings."], confidence: .78, jurisdiction: "Kuwait",
    evidence: [{ title: "Vehicle lift guide", url: "https://manufacturer.example/vehicle-lift", publisher: "manufacturer.example", provenance: "RESEARCHED" }],
    provenance: "RESEARCHED", requiresEngineeringVerification: true,
  };
}

function fixture(options: { generatedResponse?: string } = {}) {
  const research = { researchSystem: vi.fn().mockImplementation(async ({ query }: { query: string }) => systemModel(/fm[-\s]?200|suppression/i.test(query) ? "fm200" : "elevator")) };
  const provider = {
    extractIntent: vi.fn().mockImplementation(async (prompt: string) => ({
      documentType: "QUOTATION",
      customerMention: prompt.includes("شركة المستقبل") ? "شركة المستقبل" : null,
      scopeType: /توريد.*تركيب|supply.*install/is.test(prompt) ? "SUPPLY_AND_INSTALLATION" : null,
      lines: /كامير/i.test(prompt) ? [{ text: "كاميرا مراقبة", quantity: Number(prompt.match(/(\d+)\s*كامير/)?.[1] ?? 1), typeIntent: "PRODUCT" }] : [],
    })),
    generateConversationResponse: options.generatedResponse ? vi.fn().mockResolvedValue({ text: options.generatedResponse }) : undefined,
  };
  const service = new AISalesAssistantService({
    companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) },
    customers: { findAll: vi.fn().mockResolvedValue([]) }, catalogItems: { findAll: vi.fn().mockResolvedValue([]) },
    units: { findById: vi.fn(), findBySymbol: vi.fn() }, quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
    pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() }, terms: { find: vi.fn().mockResolvedValue(null) },
  } as any, provider, research);
  const conversation = new CompleteCommercialConversation(service);
  const run = (reply: string, draft?: WorkingCommercialDraft, source: ConversationReplySource = "TEXT", extra: Record<string, unknown> = {}) => conversation.execute({
    companyId: "tenant-a", reply, draft, replySource: source, locale: "ar", documentMode: "QUOTATION", ...extra,
  });
  return { run, research, provider };
}

describe("Chat-First CEO Golden Scenarios", () => {
  it("1. accepts arbitrary conversational continuation without assigning it to the active field", async () => {
    const { run } = fixture(); const first = await run("عايز مصعد سيارات في الكويت"); const next = await run("خلينا نتكلم عن الاستخدام الأول", first);
    expect(next.turns.at(-2)?.target).toBeUndefined(); expect(next.transactionalState?.ledger.requestId).toBe(first.id);
  });
  it("2. understands كمل as conversational control", async () => {
    const { run } = fixture(); const first = await run("عايز مصعد سيارات في الكويت"); const next = await run("كمل", first);
    expect(next.assistantResponse?.ar).toContain("مكمل"); expect(next.answers?.[first.activeQuestion!.field as never]).toBeUndefined();
  });
  it("3. corrects a previous fact with USER_CORRECTION precedence", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("مصعد واحد يخدم 6 أدوار", draft); draft = await run("لا خليه 8 أدوار مش 6", draft);
    expect(draft.transactionalState?.ledger.facts["system.numberOfStops"]).toMatchObject({ value: 8, source: "USER_CORRECTION" });
  });
  it("4. keeps pronoun/reference context for إيه الأفضل", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("خليه يشيل SUV", draft); draft = await run("طب إيه الأفضل؟", draft);
    expect(draft.assistantResponse?.ar).toMatch(/SUV|المصعد|التكوين/); expect(draft.canonicalProposal?.agenticState?.systemName).toBe("Vehicle Elevator");
  });
  it("5. does not dead-end on مش عارف", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("مش عارف", draft);
    expect(draft.assistantResponse?.ar).toMatch(/أقدر|مبدئي/); expect(draft.conversationMessages?.at(-1)?.role).toBe("ASSISTANT");
  });
  it("6. provides a bounded recommendation with an explicit limitation", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("اختارلي حاجة مناسبة", draft);
    expect(draft.assistantResponse?.ar).toMatch(/مبدئي|أبعاد|مخطط/);
  });
  it("7. invokes research autonomously for an unknown system", async () => {
    const { run, research } = fixture(); await run("عايز نظام مصعد سيارات زي الشركات الكبيرة في الكويت"); expect(research.researchSystem).toHaveBeenCalledTimes(1);
  });
  it("8. reuses retained research evidence across turns", async () => {
    const { run, research } = fixture(); const first = await run("عايز مصعد سيارات في الكويت"); await run("كمل", first); expect(research.researchSystem).toHaveBeenCalledTimes(1);
  });
  it("9. avoids research for a verified CCTV system", async () => {
    const { run, research } = fixture(); const draft = await run("اعمل عرض سعر توريد وتركيب 8 كاميرات مراقبة IP وتخزين 30 يوم");
    expect(draft.canonicalProposal?.smartSystem).toBeTruthy(); expect(research.researchSystem).not.toHaveBeenCalled();
  });
  it("10. captures a customer conversationally without blocking technical work", async () => {
    const { run } = fixture(); const draft = await run("العرض لشركة المستقبل وعايز مصعد سيارات في الكويت");
    expect(draft.proposedCustomerName).toBe("شركة المستقبل"); expect(draft.canonicalProposal?.agenticState).toBeTruthy();
  });
  it("11. captures payment terms conversationally", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("خلي الدفع 50% مقدم و50% بعد التوريد", draft);
    expect(draft.answers?.paymentTerms).toContain("50%"); expect(draft.transactionalState?.ledger.facts.paymentTerms.value).toContain("50%");
  });
  it("12. defers payment conversationally", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("سيب الدفع دلوقتي وكمل", draft);
    expect(draft.transactionalState?.ledger.facts.paymentTerms).toMatchObject({ value: "DEFERRED" });
  });
  it("13. does not enter a blocking red-loop after payment defer", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("سيب الدفع دلوقتي وكمل", draft);
    expect(draft.transactionalState?.ledger.facts.paymentTerms.value).toBe("DEFERRED"); expect(draft.activeQuestion?.field).not.toBe("paymentTerms"); expect(draft.assistantResponse?.ar).toBeTruthy();
  });
  it("14. never exposes internal workflow terminology", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("مصعد واحد يخدم 6 أدوار", draft);
    expect(draft.assistantResponse?.ar).not.toMatch(/SYSTEM_PLANNED|materializ|readiness|تحويل المتطلبات|المراجعة الهندسية/i);
  });
  it("15. preserves Vehicle Elevator multi-turn continuity", async () => {
    const { run } = fixture(); let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت"); draft = await run("مصعد سيارات واحد يخدم 6 طوابق", draft);
    expect(draft.systemWorkingPlan?.knownInputs).toMatchObject({ elevatorQuantity: 1, numberOfStops: 6 });
  });
  it("16. preserves SUV intent without inventing rated load", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("خليه يشيل SUV", draft);
    expect(draft.transactionalState?.ledger.facts["system.vehicleClass"]).toMatchObject({ value: "SUV", source: "USER_EXPLICIT" }); expect(draft.systemWorkingPlan?.knownInputs.capacity).toBeUndefined();
  });
  it("17. answers the Vehicle Elevator recommendation question contextually", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("خليه يشيل SUV", draft); draft = await run("طب إيه الأفضل؟", draft);
    expect(draft.assistantResponse?.ar).toContain("SUV"); expect(draft.assistantResponse?.ar).toMatch(/الحمولة|الأبعاد/);
  });
  it("18. keeps FM-200 sizing safety-critical and provisional", async () => {
    const { run } = fixture(); const draft = await run("عايز نظام FM-200 كامل طبقًا لمتطلبات الكويت");
    expect(draft.canonicalProposal?.lines).toEqual([]); expect(draft.activeQuestion?.field).toBe("protectedVolume"); expect(draft.canonicalProposal?.agenticState?.provisionalSystem?.limitations.join(" ")).toMatch(/quantity|sizing/i);
  });
  it("19. preserves CCTV deterministic commercialization", async () => {
    const { run } = fixture(); const draft = await run("اعمل عرض سعر توريد وتركيب 8 كاميرات مراقبة IP وتخزين 30 يوم");
    expect(draft.canonicalProposal?.smartSystem?.systemType).toBeTruthy(); expect(draft.canonicalProposal?.lines.length).toBeGreaterThan(0);
  });
  it("20. sends voice and text through the same engine", async () => {
    const { run } = fixture(); const text = await run("عايز مصعد سيارات في الكويت", undefined, "TEXT"); const voice = await run("مصعد واحد يخدم 6 أدوار", text, "VOICE");
    expect(voice.conversationMessages?.at(-2)).toMatchObject({ role: "USER", source: "VOICE" }); expect(voice.transactionalState?.ledger.facts["system.numberOfStops"].value).toBe(6);
  });
  it("21. rejects fabricated response-generator prices", async () => {
    const { run } = fixture({ generatedResponse: "السعر المؤكد 999 KWD" }); const draft = await run("عايز مصعد سيارات في الكويت");
    expect(draft.assistantResponse?.ar).not.toContain("999");
  });
  it("22. prevents researched facts from overwriting a user correction", () => {
    const first: TurnDecision = { requestId: "r", turn: 1, turnId: "r:1", patches: [{ field: "system.numberOfStops", operation: "SET", value: 8, provenance: "USER_CORRECTION" }], researchRequests: [], unresolvedFacts: [], nextQuestion: null, readinessProposal: "NEEDS_INFORMATION" };
    const committed = commitTurnDecision(null, first, new Set(["system.numberOfStops"]));
    const lower: TurnDecision = { ...first, turn: 2, turnId: "r:2", patches: [{ field: "system.numberOfStops", operation: "REPLACE", value: 6, provenance: "RESEARCHED" }] };
    expect(commitTurnDecision(committed.ledger, lower, new Set(["system.numberOfStops"])).ledger.facts["system.numberOfStops"].value).toBe(8);
  });
  it("23. projects the live result from canonical state", async () => {
    const { run } = fixture(); let draft = await run("عايز مصعد سيارات في الكويت"); draft = await run("مصعد واحد يخدم 6 أدوار", draft);
    expect(draft.structuredResult?.facts).toEqual(expect.arrayContaining([expect.objectContaining({ key: "system.numberOfStops", value: "6", status: "CONFIRMED" })]));
  });
  it("24. lets conversation continue while unresolved fields remain", async () => {
    const { run } = fixture(); const draft = await run("عايز مصعد سيارات في الكويت");
    expect(draft.missingRequired.length).toBeGreaterThan(0); expect(draft.assistantResponse?.ar).toBeTruthy(); expect(draft.conversationMessages?.map((turn) => turn.role)).toEqual(["USER", "ASSISTANT"]);
  });
  it("25. keeps Draft readiness deterministic and separate from chat ability", async () => {
    const { run } = fixture(); const draft = await run("عايز مصعد سيارات في الكويت");
    expect(draft.readinessStage).not.toBe("READY_FOR_DRAFT"); expect(draft.status).toBe("NEEDS_CLARIFICATION"); expect(draft.internalIterations).toBeLessThanOrEqual(4);
  });

  it("26. keeps the exact CEO chat and compact summary coherent without repeating provider interpretation", async () => {
    const research = { researchSystem: vi.fn() };
    const provider = {
      reasonConversation: vi.fn(async ({ currentTurn }: { currentTurn: string }) => {
        const targetField = /طوابق/.test(currentTurn) ? "numberOfStops"
          : currentTurn === "الشركة الوطنية" || /العميل الشركة/.test(currentTurn) ? "customerMention"
          : /هيلتون/.test(currentTurn) ? "projectName"
          : /مهندس/.test(currentTurn) ? "attentionName"
          : /أسبوع/.test(currentTurn) ? "delivery" : null;
        return {
          mode: /العميل الشركة/.test(currentTurn) ? "CORRECTION" : "PROVIDE_FACTS",
          targetField, deferPayment: false, researchRequired: /search|ابحث|دور على/i.test(currentTurn),
          intent: {
            documentType: "QUOTATION", scopeType: "SUPPLY_AND_INSTALLATION", lines: [], facts: [],
            customerMention: currentTurn === "الشركة الوطنية" ? "الشركة الوطنية" : /العميل الشركة الوطنية للاتصالات/.test(currentTurn) ? "الشركة الوطنية للاتصالات" : null,
            projectName: /هيلتون/.test(currentTurn) ? "هيلتون السالمية" : null,
            attentionName: /مهندس/.test(currentTurn) ? "مهندس أحمد الخولي" : null,
            delivery: /أسبوع/.test(currentTurn) ? "أسبوع من تاريخ الاعتماد" : null,
            expiryDate: null,
          },
        };
      }),
      extractIntent: vi.fn().mockRejectedValue(new Error("duplicate interpretation must not run")),
    };
    const service = new AISalesAssistantService({
      companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) },
      customers: { findAll: vi.fn().mockResolvedValue([]) }, catalogItems: { findAll: vi.fn().mockResolvedValue([]) },
      units: { findById: vi.fn(), findBySymbol: vi.fn() }, quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
      pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() }, terms: { find: vi.fn().mockResolvedValue(null) },
    } as any, provider, research);
    const conversation = new CompleteCommercialConversation(service);
    const messages = [
      "عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات في الكويت.", "ستة طوابق بالضبط.", "الشركة الوطنية",
      "العميل الشركة الوطنية للاتصالات", "هيلتون السالمية", "مهندس أحمد الخولي", "أسبوع من تاريخ الاعتماد",
    ];
    let draft: WorkingCommercialDraft | undefined;
    for (const reply of messages) {
      draft = await conversation.execute({ companyId: "tenant-a", reply, draft, replySource: "TEXT", locale: "ar", documentMode: "QUOTATION" });
      for (const fact of draft.structuredResult?.summary ?? []) {
        expect(String(draft.transactionalState?.ledger.facts[fact.key]?.value)).toEqual(fact.value);
      }
    }
    const summary = Object.fromEntries(draft!.structuredResult!.summary.map((fact) => [fact.key, fact.valueAr ?? fact.value]));
    expect(summary).toMatchObject({
      "system.identity": "نظام مصعد سيارات", "system.jurisdiction": "الكويت", scopeType: "توريد وتركيب",
      "system.numberOfStops": "6", customerMention: "الشركة الوطنية للاتصالات", projectName: "هيلتون السالمية",
      attentionName: "مهندس أحمد الخولي", validity: "أسبوع من تاريخ الاعتماد",
    });
    expect(draft!.structuredResult!.stillNeeded.map((field) => field.key)).toEqual(expect.arrayContaining(["paymentTerms", "delivery", "warranty"]));
    expect(draft!.structuredResult!.stillNeeded.map((field) => field.key)).not.toContain("expiryDate");
    expect(draft!.structuredResult!.summary.map((fact) => fact.labelAr).join(" ")).not.toMatch(/projectConfiguration|attentionName|systemProfileId|engineeringRequirement|[a-z]+[A-Z]/);
    expect(provider.extractIntent).not.toHaveBeenCalled();
    expect(research.researchSystem).not.toHaveBeenCalled();
    await conversation.execute({ companyId: "tenant-a", reply: "اعمل search على النظام", draft, replySource: "TEXT", locale: "ar", documentMode: "QUOTATION" });
    expect(research.researchSystem).toHaveBeenCalledTimes(1);
  });
});
