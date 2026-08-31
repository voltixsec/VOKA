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

function fixture(options: { generatedResponse?: string; onTiming?: (timing: any) => void; withGuidance?: boolean; reasonConversation?: (currentTurn: string) => unknown } = {}) {
  const research = { researchSystem: vi.fn().mockImplementation(async ({ query, onProviderCall }: { query: string; onProviderCall?: () => void }) => {
    onProviderCall?.();
    const model = systemModel(/fm[-\s]?200|suppression/i.test(query) ? "fm200" : "elevator");
    if (options.withGuidance && model.systemName === "Vehicle Elevator") {
      model.inputs.push({
        name: "driveType",
        labelAr: "نوع نظام الحركة",
        labelEn: "Drive type",
        value: null,
        required: true,
        provenance: "NEEDS_CONFIRMATION",
        guidance: {
          options: [
            { value: "traction", labelAr: "نظام جر", labelEn: "Traction", explanationAr: "مناسب عادةً للحركة المتكررة وعدد الوقفات الأكبر.", explanationEn: "Typically suited to repeated operation and higher stop counts." },
            { value: "hydraulic", labelAr: "نظام هيدروليكي", labelEn: "Hydraulic", explanationAr: "قد يناسب التطبيقات ذات ظروف التشغيل المختلفة.", explanationEn: "May suit applications with different operating conditions." },
          ],
          recommendedValue: "traction",
          rationaleAr: "ترشيح مبدئي مبني على المعرفة الفنية المتاحة ويحتاج تأكيد بيانات المشروع.",
          rationaleEn: "A preliminary recommendation based on available technical knowledge and requiring project confirmation.",
          requiresConfirmation: true,
          provenance: "RESEARCHED",
        },
      });
    }
    return model;
  }) };
  const provider = {
    reasonConversation: options.reasonConversation
      ? vi.fn(async ({ currentTurn }: { currentTurn: string }) => options.reasonConversation!(currentTurn))
      : undefined,
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
  const conversation = new CompleteCommercialConversation(service, { onTiming: options.onTiming });
  const run = (reply: string, draft?: WorkingCommercialDraft, source: ConversationReplySource = "TEXT", extra: Record<string, unknown> = {}) => conversation.execute({
    companyId: "tenant-a", reply, draft, replySource: source, locale: "ar", documentMode: "QUOTATION", ...extra,
  });
  return { run, research, provider };
}

async function reachDriveGuidance() {
  const setup = fixture({ withGuidance: true });
  let draft = await setup.run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت");
  draft = await setup.run("مصعد واحد يخدم 6 طوابق", draft);
  draft = await setup.run("أنا مش فاهم قوي في المصاعد إنت شوف الأنسب أو اديني اختيارات", draft);
  return { ...setup, draft };
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
  it("17b. keeps recommendation turns inside engineering guidance instead of jumping to commercial fields", async () => {
    const { run } = fixture({ withGuidance: true });
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("أنا مش فاهم قوي في المصاعد إنت شوف الأنسب أو اديني اختيارات", draft);

    expect(draft.activeQuestion?.field).not.toBe("customerMention");
    expect(draft.activeQuestion?.field).not.toBe("projectName");
    expect(draft.activeQuestion?.field).not.toBe("paymentTerms");
    expect(draft.assistantResponse?.ar).toContain("نظام جر");
    expect(draft.assistantResponse?.ar).toContain("نظام هيدروليكي");
    expect(draft.assistantResponse?.ar).toMatch(/ترشيحي المبدئي|ترشيح مبدئي/);
    expect(draft.assistantResponse?.ar).toMatch(/من غير تأكيدك|يحتاج تأكيد/);
    expect(draft.canonicalProposal?.agenticState?.provisionalSystem?.inputs.find((field) => field.name === "driveType")?.value).toBeNull();
    expect(Object.values(draft.transactionalState?.ledger.facts ?? {}).some((fact) => String(fact.value).includes("مش فاهم قوي"))).toBe(false);

    const repeated = await run("مش فاهم", draft);
    expect(repeated.activeQuestion?.field).toBe("driveType");
    expect(repeated.assistantResponse?.ar).toContain("نظام جر");
    expect(repeated.systemAnswers?.driveType).toBeUndefined();
  });

  it("17b.1 handles the real CEO recommendation path without injected research guidance", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات في الكويت");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    const beforeCommercial = {
      customerMention: draft.answers?.customerMention,
      projectName: draft.answers?.projectName,
      paymentTerms: draft.answers?.paymentTerms,
    };
    const guidanceText = "أنا مش فاهم قوي في المصاعد، إنت شوف الأنسب أو اديني اختيارات";
    draft = await run(guidanceText, draft);

    expect(draft.activeQuestion).toMatchObject({ field: "vehicleClass" });
    expect(draft.activeQuestion?.field).not.toMatch(/customerMention|projectName|paymentTerms|capacity/);
    expect(draft.activeQuestion?.options?.map((option) => option.value)).toEqual(["PASSENGER_CAR", "SUV", "HEAVIER_VEHICLE"]);
    expect(draft.assistantResponse?.ar).toMatch(/سيارات ركوب عادية|SUV|مركبات أثقل/);
    expect(draft.assistantResponse?.ar).not.toMatch(/ما الحمولة المطلوبة/);
    expect(draft.systemAnswers?.capacity).toBeUndefined();
    expect(draft.systemAnswers?.vehicleClass).toBeUndefined();
    expect({
      customerMention: draft.answers?.customerMention,
      projectName: draft.answers?.projectName,
      paymentTerms: draft.answers?.paymentTerms,
    }).toEqual(beforeCommercial);
    expect(Object.values(draft.transactionalState?.ledger.facts ?? {}).some((fact) => fact.value === guidanceText)).toBe(false);
    expect(Object.values(draft.systemAnswers ?? {})).not.toContain(guidanceText);
    expect(draft.structuredResult?.facts.map((fact) => fact.value)).not.toContain(guidanceText);
    expect(draft.structuredResult?.summary.map((fact) => fact.value)).not.toContain(guidanceText);
    expect(draft.turns.at(-1)?.target).toBeUndefined();
  });

  it("17b.2 never captures a standalone choose-for-me control sentence as a fact or chip", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات في الكويت");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    const guidanceText = "شوف انت واديني اختيارات";
    draft = await run(guidanceText, draft);

    expect(draft.activeQuestion?.field).toBe("vehicleClass");
    expect(draft.systemAnswers?.capacity).toBeUndefined();
    expect(Object.values(draft.transactionalState?.ledger.facts ?? {}).some((fact) => fact.value === guidanceText)).toBe(false);
    expect(Object.values(draft.systemAnswers ?? {})).not.toContain(guidanceText);
    expect(draft.structuredResult?.facts.map((fact) => fact.value)).not.toContain(guidanceText);
    expect(draft.structuredResult?.summary.map((fact) => fact.value)).not.toContain(guidanceText);
    expect(draft.turns.at(-1)?.target).toBeUndefined();
  });

  it("17b.3 treats the provider's recommendation mode as control even when it targets capacity", async () => {
    const controlText = "ساعدني أقرر في النقطة دي";
    const { run } = fixture({
      reasonConversation: (currentTurn) => currentTurn === controlText
        ? { mode: "RECOMMENDATION", targetField: "capacity", deferPayment: false, researchRequired: false, intent: { documentType: "QUOTATION", capacity: controlText, lines: [], facts: [] } }
        : { mode: "PROVIDE_FACTS", targetField: null, deferPayment: false, researchRequired: false, intent: { documentType: "QUOTATION", scopeType: "SUPPLY_AND_INSTALLATION", lines: [], facts: [] } },
    });
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات في الكويت");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run(controlText, draft);

    expect(draft.activeQuestion?.field).toBe("vehicleClass");
    expect(draft.systemAnswers?.capacity).toBeUndefined();
    expect(Object.values(draft.transactionalState?.ledger.facts ?? {}).some((fact) => fact.value === controlText)).toBe(false);
    expect(draft.structuredResult?.facts.map((fact) => fact.value)).not.toContain(controlText);
  });

  it("17b.4 continues the real CEO path from confirmed SUV to a safe capacity prerequisite", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات في الكويت");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("أنا مش فاهم قوي في المصاعد، إنت شوف الأنسب أو اديني اختيارات", draft);
    draft = await run("سيارات SUV", draft);

    expect(draft.transactionalState?.ledger.facts["system.vehicleClass"]).toMatchObject({ value: "SUV", source: "USER_EXPLICIT" });
    expect(draft.activeQuestion).toMatchObject({ field: "maximumVehicleWeight", guidanceFor: "capacity" });

    const question = "إيه هي الحمولات المتاحة؟";
    draft = await run(question, draft);

    expect(draft.transactionalState?.ledger.facts["system.vehicleClass"]).toMatchObject({ value: "SUV", source: "USER_EXPLICIT" });
    expect(draft.activeQuestion).toMatchObject({ field: "maximumVehicleWeight", guidanceFor: "capacity" });
    expect(draft.activeQuestion?.field).not.toMatch(/customerMention|projectName|paymentTerms/);
    expect(draft.assistantResponse?.ar).toMatch(/SUV.*(?:نوع السيارة|الحمولة|أقصى وزن|أبعاد|مخطط)|(?:نوع السيارة|الحمولة|أقصى وزن|أبعاد|مخطط).*SUV/s);
    expect(draft.assistantResponse?.ar).not.toBe("ما الحمولة المطلوبة للمصعد؟");
    expect(draft.systemAnswers?.capacity).toBeUndefined();
    expect(draft.transactionalState?.ledger.facts["system.capacity"]).toBeUndefined();
    expect(Object.values(draft.transactionalState?.ledger.facts ?? {}).some((fact) => fact.value === question)).toBe(false);
    expect(Object.values(draft.systemAnswers ?? {})).not.toContain(question);
    expect(draft.structuredResult?.facts.map((fact) => fact.value)).not.toContain(question);
    expect(draft.structuredResult?.summary.map((fact) => fact.value)).not.toContain(question);
    expect(draft.turns.at(-1)?.target).toBeUndefined();
  });

  it("17b.5 answers رشحلي الأنسب after SUV with the next safe prerequisite", async () => {
    const { run } = fixture();
    let draft = await run("عايز مصعد سيارات في الكويت");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("اديني اختيارات", draft);
    draft = await run("سيارات SUV", draft);
    const recommendation = "رشحلي الأنسب";
    draft = await run(recommendation, draft);

    expect(draft.activeQuestion).toMatchObject({ field: "maximumVehicleWeight", guidanceFor: "capacity" });
    expect(draft.assistantResponse?.ar).toMatch(/SUV|أقصى وزن|أبعاد|مخطط/);
    expect(draft.systemAnswers?.capacity).toBeUndefined();
    expect(Object.values(draft.transactionalState?.ledger.facts ?? {}).some((fact) => fact.value === recommendation)).toBe(false);
  });

  it("17b.6 preserves English question parity after the SUV prerequisite", async () => {
    const { run } = fixture();
    const turn = (reply: string, draft?: WorkingCommercialDraft) => run(reply, draft, "TEXT", { locale: "en" });
    let draft = await turn("Create a supply and installation quotation for a vehicle elevator in Kuwait");
    draft = await turn("1 elevator serving 6 floors", draft);
    draft = await turn("I don't know the engineering details, give me options", draft);
    draft = await turn("SUVs", draft);
    const question = "What capacities are available?";
    draft = await turn(question, draft);

    expect(draft.transactionalState?.ledger.facts["system.vehicleClass"]).toMatchObject({ value: "SUV", source: "USER_EXPLICIT" });
    expect(draft.activeQuestion).toMatchObject({ field: "maximumVehicleWeight", guidanceFor: "capacity" });
    expect(draft.assistantResponse?.en).toMatch(/SUV|rated load|maximum vehicle weight|platform|shaft|drawing/i);
    expect(draft.systemAnswers?.capacity).toBeUndefined();
    expect(Object.values(draft.transactionalState?.ledger.facts ?? {}).some((fact) => fact.value === question)).toBe(false);
  });

  it("17b.7 advances the exact six-turn CEO scenario beyond an unknown vehicle weight", async () => {
    const { run } = fixture();
    let draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات في الكويت");
    draft = await run("مصعد واحد يخدم 6 طوابق", draft);
    draft = await run("أنا مش فاهم قوي في المصاعد، إنت شوف الأنسب أو اديني اختيارات", draft);
    draft = await run("سيارات SUV", draft);
    draft = await run("إيه هي الحمولات المتاحة؟", draft);
    const priorResponse = draft.assistantResponse?.ar;
    const unknownWeight = "فيه أوزان معينة تديني اختيارات؟ أنا مش عارف الأوزان، ممكن أختار إيه؟";
    draft = await run(unknownWeight, draft);

    expect(draft.transactionalState?.ledger.facts["system.vehicleClass"]).toMatchObject({ value: "SUV", source: "USER_EXPLICIT" });
    expect(draft.systemAnswers?.capacity).toBeUndefined();
    expect(draft.systemAnswers?.maximumVehicleWeight).toBeUndefined();
    expect(draft.canonicalProposal?.agenticState?.provisionalSystem?.inputs.find((input) => input.name === "capacity")?.value).toBeNull();
    expect(draft.canonicalProposal?.agenticState?.provisionalSystem?.inputs.find((input) => input.name === "maximumVehicleWeight")?.value).toBeNull();
    expect(draft.temporarilyUnanswerable).toContain("maximumVehicleWeight");
    expect(draft.activeQuestion).toMatchObject({ field: "expectedVehicleModel", guidanceFor: "capacity" });
    expect(draft.activeQuestion?.field).not.toMatch(/capacity|maximumVehicleWeight|customerMention|projectName|paymentTerms/);
    expect(draft.assistantResponse?.ar).toMatch(/نوع|موديل|مركبة/);
    expect(draft.assistantResponse?.ar).not.toBe(priorResponse);
    expect(draft.assistantResponse?.ar).not.toMatch(/\d+(?:[.,]\d+)?\s*(?:kg|كجم|كغ|كيلو)/i);
    expect(Object.values(draft.transactionalState?.ledger.facts ?? {}).some((fact) => fact.value === unknownWeight)).toBe(false);
    expect(Object.values(draft.systemAnswers ?? {})).not.toContain(unknownWeight);
    expect(draft.structuredResult?.facts.map((fact) => fact.value)).not.toContain(unknownWeight);
    expect(draft.structuredResult?.summary.map((fact) => fact.value)).not.toContain(unknownWeight);
    expect(draft.conversationMessages?.at(-1)?.role).toBe("ASSISTANT");
  });

  it.each([
    { message: "مش عارف الوزن", locale: "ar" as const, source: "TEXT" as const },
    { message: "مش عارف الوزن", locale: "ar" as const, source: "VOICE" as const },
    { message: "I don't know the vehicle weight", locale: "en" as const, source: "TEXT" as const },
    { message: "What else can you use to decide?", locale: "en" as const, source: "TEXT" as const },
  ])("17b.8 recursively advances for $message via $source", async ({ message, locale, source }) => {
    const { run } = fixture();
    const turn = (reply: string, draft?: WorkingCommercialDraft, replySource: ConversationReplySource = "TEXT") => run(reply, draft, replySource, { locale });
    let draft = locale === "ar"
      ? await turn("عايز مصعد سيارات في الكويت")
      : await turn("Create a vehicle elevator quotation in Kuwait");
    draft = locale === "ar" ? await turn("مصعد واحد يخدم 6 طوابق", draft) : await turn("1 elevator serving 6 floors", draft);
    draft = locale === "ar" ? await turn("اديني اختيارات", draft) : await turn("Give me options", draft);
    draft = await turn("SUV", draft);
    draft = locale === "ar" ? await turn("إيه هي الحمولات المتاحة؟", draft) : await turn("What capacities are available?", draft);
    draft = await turn(message, draft, source);

    expect(draft.activeQuestion).toMatchObject({ field: "expectedVehicleModel", guidanceFor: "capacity" });
    expect(draft.systemAnswers?.maximumVehicleWeight).toBeUndefined();
    expect(Object.values(draft.transactionalState?.ledger.facts ?? {}).some((fact) => fact.value === message)).toBe(false);
    expect(draft.conversationMessages?.at(-2)).toMatchObject({ role: "USER", source, text: message });
  });

  it("17c. commits a confirmed recommendation only as the selected engineering input", async () => {
    const { run, draft: guided } = await reachDriveGuidance();
    const draft = await run("موافق", guided);

    expect(draft.systemAnswers?.driveType).toBe("traction");
    expect(draft.transactionalState?.ledger.facts["system.driveType"]).toMatchObject({ value: "traction", source: "USER_EXPLICIT" });
    expect(draft.answers).not.toMatchObject({ customerMention: expect.anything(), projectName: expect.anything(), paymentTerms: expect.anything() });
    expect(draft.systemAnswers?.capacity).toBeUndefined();
  });

  it("17d. commits the first bounded option from an ordinal selection", async () => {
    const { run, draft: guided } = await reachDriveGuidance();
    const draft = await run("اختار الأول", guided);
    expect(draft.systemAnswers?.driveType).toBe("traction");
    expect(draft.transactionalState?.ledger.facts["system.driveType"].source).toBe("USER_EXPLICIT");
  });

  it("17e. commits an exact Arabic option label and nothing outside the option set", async () => {
    const { run, draft: guided } = await reachDriveGuidance();
    const draft = await run("خليه هيدروليكي", guided);
    expect(draft.systemAnswers?.driveType).toBe("hydraulic");
    expect(["traction", "hydraulic"]).toContain(draft.systemAnswers?.driveType);
  });

  it("17f. rejects an unavailable ordinal and remains in the same guidance state", async () => {
    const { run, draft: guided } = await reachDriveGuidance();
    const draft = await run("اختار الخيار الثالث", guided);
    expect(draft.systemAnswers?.driveType).toBeUndefined();
    expect(draft.canonicalProposal?.agenticState?.provisionalSystem?.inputs.find((field) => field.name === "driveType")?.value).toBeNull();
    expect(draft.activeQuestion).toMatchObject({ field: "driveType" });
    expect(draft.activeQuestion?.options?.map((option) => option.value)).toEqual(["traction", "hydraulic"]);
    expect(draft.assistantResponse?.ar).toMatch(/مش ضمن الخيارات|غير متاح/);
  });

  it("17g. never assigns a guidance sentence or confirmation to capacity", async () => {
    const { run, draft: guided } = await reachDriveGuidance();
    expect(guided.systemAnswers?.capacity).toBeUndefined();
    const confirmed = await run("تمام اختار ده", guided);
    expect(confirmed.systemAnswers).toMatchObject({ driveType: "traction" });
    expect(confirmed.systemAnswers?.capacity).toBeUndefined();
    expect(confirmed.transactionalState?.ledger.facts["system.capacity"]).toBeUndefined();
  });

  it("17h. continues to the next unresolved engineering input after confirmation", async () => {
    const { run, draft: guided } = await reachDriveGuidance();
    const draft = await run("امشي على ترشيحك", guided);
    expect(draft.activeQuestion).toMatchObject({ field: "vehicleClass", guidanceFor: "capacity" });
    expect(draft.activeQuestion?.field).not.toMatch(/customerMention|projectName|paymentTerms/);
    expect(draft.canonicalProposal?.agenticState?.missingInputs).toEqual(["capacity"]);
  });

  it("17i. promotes a later bounded change through USER_CORRECTION precedence", async () => {
    const { run, draft: guided } = await reachDriveGuidance();
    const confirmed = await run("موافق", guided);
    const corrected = await run("لا خليه hydraulic بدل traction", confirmed);
    expect(corrected.systemAnswers?.driveType).toBe("hydraulic");
    expect(corrected.transactionalState?.ledger.facts["system.driveType"]).toMatchObject({ value: "hydraulic", source: "USER_CORRECTION" });
  });

  it("17j. keeps researched advice RESEARCHED while the selected project fact becomes USER_EXPLICIT", async () => {
    const { run, draft: guided } = await reachDriveGuidance();
    const draft = await run("use your recommendation", guided);
    const input = draft.canonicalProposal?.agenticState?.provisionalSystem?.inputs.find((field) => field.name === "driveType");
    expect(input).toMatchObject({ value: "traction", provenance: "USER_PROVIDED", guidance: { provenance: "RESEARCHED" } });
    expect(draft.transactionalState?.ledger.facts["system.driveType"].source).toBe("USER_EXPLICIT");
  });

  it("17k. does not fabricate FM-200 guidance or sizing when bounded advice is absent", async () => {
    const { run } = fixture({ withGuidance: true });
    const first = await run("عايز نظام FM-200 كامل طبقًا لمتطلبات الكويت");
    const draft = await run("اختارلي", first);
    expect(draft.activeQuestion?.field).toBe("protectedVolume");
    expect(draft.systemAnswers?.protectedVolume).toBeUndefined();
    expect(draft.canonicalProposal?.agenticState?.provisionalSystem?.inputs.every((field) => !field.guidance)).toBe(true);
    expect(draft.canonicalProposal?.lines).toEqual([]);
  });

  it("17l. resolves the same guided confirmation through text and voice", async () => {
    const textFlow = await reachDriveGuidance();
    const voiceFlow = await reachDriveGuidance();
    const text = await textFlow.run("موافق", textFlow.draft, "TEXT");
    const voice = await voiceFlow.run("موافق", voiceFlow.draft, "VOICE");
    expect(text.systemAnswers?.driveType).toBe("traction");
    expect(voice.systemAnswers?.driveType).toBe(text.systemAnswers?.driveType);
    expect(voice.conversationMessages?.at(-2)).toMatchObject({ role: "USER", source: "VOICE", text: "موافق" });
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
    const { run, provider } = fixture({ generatedResponse: "السعر المؤكد 999 KWD" }); const draft = await run("عايز مصعد سيارات في الكويت");
    expect(draft.assistantResponse?.ar).not.toContain("999"); expect(provider.generateConversationResponse).not.toHaveBeenCalled();
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
    const timings: any[] = [];
    const conversation = new CompleteCommercialConversation(service, { onTiming: (timing) => timings.push(timing) });
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
    expect(timings).toHaveLength(messages.length);
    expect(timings.every((timing) => timing.aiProviderCallCount === 1 && timing.providerCallBreakdown.SEMANTIC === 1 && timing.naturalResponseMs < 20)).toBe(true);
    await conversation.execute({ companyId: "tenant-a", reply: "اعمل search على النظام", draft, replySource: "TEXT", locale: "ar", documentMode: "QUOTATION" });
    expect(research.researchSystem).toHaveBeenCalledTimes(1);
  });

  it("27. explicitly communicates Vehicle Elevator understanding with provisional component language", async () => {
    const { run } = fixture();
    const draft = await run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات في الكويت.");
    expect(draft.assistantResponse?.ar).toMatch(/فهمت النظام.*مصعد سيارات.*توريد وتركيب.*الكويت/);
    expect(draft.structuredResult?.systemUnderstanding).toMatchObject({ confidence: "PROVISIONAL", recognized: true });
    expect(draft.structuredResult?.systemUnderstanding?.components.map((item) => item.labelAr)).toEqual(expect.arrayContaining(["مجموعة الرفع والحركة", "منظومة التحكم", "منظومة الأمان"]));
    expect(JSON.stringify(draft.structuredResult?.systemUnderstanding)).not.toMatch(/componentKey|systemProfile|requirementKey/);
  });

  it("28. uses governed CCTV knowledge without research and keeps 20 cameras and 4MP coherent", async () => {
    const { run, research } = fixture();
    const draft = await run("عايز عرض سعر نظام كاميرات كامل 20 كاميرا 4MP في الكويت.");
    const summary = Object.fromEntries(draft.structuredResult!.summary.map((item) => [item.key, item.value]));
    const systemIdentity = draft.structuredResult!.summary.find((item) => item.key === "system.identity");
    expect(draft.structuredResult?.systemUnderstanding?.confidence).toBe("TRUSTED");
    expect(systemIdentity?.valueAr).toMatch(/كامير/);
    expect(draft.assistantResponse?.ar).toMatch(/كامير/);
    expect(summary).toMatchObject({ "system.jurisdiction": "Kuwait", "system.cameraCount": "20", "system.resolutionMp": "4" });
    expect(draft.canonicalProposal?.lines.find((line) => line.componentKey === "CCTV_CAMERAS")?.quantity).toBe(20);
    expect(research.researchSystem).not.toHaveBeenCalled();
  });

  it("29. explains FM-200 limits without inventing agent, cylinder, or nozzle sizing", async () => {
    const { run } = fixture();
    const draft = await run("عايز نظام FM-200 كامل في الكويت.");
    expect(draft.structuredResult?.systemUnderstanding?.confidence).toBe("SAFETY_CRITICAL");
    expect(draft.assistantResponse?.ar).toMatch(/التصميم والكميات النهائية.*أبعاد الحيز.*قبل الاعتماد/);
    expect(draft.canonicalProposal?.lines).toEqual([]);
    expect(draft.assistantResponse?.ar).not.toMatch(/\d+\s*(?:كجم|كيلو|أسطوان|فوه)/);
  });

  it("30. records exact provider call counts after eliminating duplicate natural-response generation", async () => {
    const normalTiming: any[] = [];
    const normal = fixture({ onTiming: (timing) => normalTiming.push(timing) });
    await normal.run("عايز عرض سعر نظام كاميرات كامل 20 كاميرا 4MP في الكويت.");
    expect(normalTiming.at(-1)).toMatchObject({ aiProviderCallCount: 1, providerCallBreakdown: { INTENT_FALLBACK: 1, RESEARCH: 0 }, researchInvoked: false });

    const researchTiming: any[] = [];
    const researched = fixture({ onTiming: (timing) => researchTiming.push(timing) });
    await researched.run("عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات في الكويت.");
    expect(researchTiming.at(-1)).toMatchObject({ aiProviderCallCount: 2, providerCallBreakdown: { INTENT_FALLBACK: 1, RESEARCH: 1 }, researchInvoked: true });
    expect(researchTiming.at(-1).naturalResponseMs).toBeLessThan(20);
  });
});
